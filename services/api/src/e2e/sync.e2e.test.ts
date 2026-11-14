import { afterAll, describe, expect, it } from 'vitest'
import { b64u, randomBytes, randomId, sha256B64u } from '../test/buddiesClient'
import { accountSignedMessage } from '../accounts/contracts'
import {
  DEV_BYPASS_TOKEN,
  LOCAL_LAUNCHER,
  bearerHeaders,
  http,
  httpBytes,
  localKv,
  openLive,
  openSession,
  writeTranscript,
  type E2ESession,
} from '../test/e2e'

/**
 * Cloud Sync (witness-work ADR 0030, ADR 0040) over real HTTP: the switches
 * in `/app/v1/config` and `GET /accounts/v1/sync`, a Supporter-only refusal
 * (with `sync:entitlement supporter` in the launcher's local KV), then put,
 * list, get, the live socket's `hello` and `changed`, `If-Match`, the kill
 * switch, and delete, and the Cloud Sync request. Then record changes
 * (ADR 0060): a change put reaches the other device on its socket and over
 * `sync/changes/list`, a base folds it in, a signed-out session's token is
 * refused, and the changes switch.
 */

afterAll(() => {
  writeTranscript('sync')
})

const slot = () => randomId().slice(0, 16)

const put = async (
  session: E2ESession,
  slotId: string,
  bytes: Uint8Array,
  headers: Record<string, string> = {}
) =>
  httpBytes('/accounts/v1/sync/put', {
    bytes,
    headers: {
      ...bearerHeaders(session),
      'x-ww-slot-id': slotId,
      'x-ww-sha256': await sha256B64u(bytes),
      ...headers,
    },
  })

/** `{ requested: true }` with the account's self-signed envelope. */
const askEnvelope = async (session: E2ESession) => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ accountPub: session.key.publicKey, ts: Date.now(), nonce: randomId() })
  )
  return {
    requested: true,
    payload: b64u(bytes),
    signature: b64u(await session.key.sign(accountSignedMessage('sync/request', bytes))),
  }
}

const syncOp = (session: E2ESession, op: string, body: unknown = {}) =>
  http('POST', `/accounts/v1/sync/${op}`, {
    body,
    headers: bearerHeaders(session),
  })

/** Cloud Sync for everyone reaches apps that send the capability (ADR 0040 §2). */
const CURRENT_APP = { appVersion: '1.47.0', capabilities: ['sync-everyone'] }

describe('Cloud Sync switches', () => {
  it('says them in the public app config', async () => {
    const config = await http('GET', '/app/v1/config')
    expect(config.status).toBe(200)
    expect(config.body.sync).toEqual({
      enabled: expect.any(Boolean),
      changes: expect.any(Boolean),
      entitlement: expect.stringMatching(/^(supporter|everyone)$/),
    })
  })
})

describe.skipIf(!DEV_BYPASS_TOKEN)('Cloud Sync with a session', () => {
  it.skipIf(!LOCAL_LAUNCHER)(
    'keeps everyone’s Cloud Sync from an app without the capability',
    async () => {
      localKv('put', 'sync:entitlement', 'everyone')
      try {
        // Even at 1.47.0, an app that doesn't send `sync-everyone` would turn
        // Cloud Sync on by itself for a device that never chose (ADR 0040 §2).
        const old = await openSession(undefined, { appVersion: '1.47.0' })
        const status = await http('GET', '/accounts/v1/sync', {
          headers: bearerHeaders(old),
        })
        expect(status.body).toMatchObject({
          entitled: false,
          entitlement: 'supporter',
          supporter: false,
        })
        const refused = await put(old, slot(), randomBytes(64))
        expect(refused.status).toBe(403)
        expect(refused.body.code).toBe('supporter_required')
        const config = await http('GET', '/app/v1/config?appVersion=1.47.0')
        expect(config.body.sync?.entitlement).toBe('supporter')

        // The same account's session with the capability is in.
        const current = await openSession(old.key, CURRENT_APP)
        const entitled = await http('GET', '/accounts/v1/sync', {
          headers: bearerHeaders(current),
        })
        expect(entitled.body).toMatchObject({ entitled: true, entitlement: 'everyone' })
        expect((await put(current, slot(), randomBytes(64))).status).toBe(200)
        const currentConfig = await http(
          'GET',
          '/app/v1/config?capabilities=sync-everyone'
        )
        expect(currentConfig.body.sync?.entitlement).toBe('everyone')
      } finally {
        localKv('delete', 'sync:entitlement')
      }
    }
  )

  it('refuses an account that isn’t a Supporter while it’s a Supporter benefit', async () => {
    if (LOCAL_LAUNCHER) localKv('put', 'sync:entitlement', 'supporter')
    try {
      const session = await openSession(undefined, CURRENT_APP)
      const status = await http('GET', '/accounts/v1/sync', {
        headers: bearerHeaders(session),
      })
      expect(status.status).toBe(200)
      if (status.body.entitlement !== 'supporter') return
      expect(status.body).toMatchObject({ supporter: false, entitled: false })
      const refused = await put(session, slot(), randomBytes(64))
      expect(refused.status).toBe(403)
      expect(refused.body.code).toBe('supporter_required')
      // Taking data off the server always works.
      expect((await syncOp(session, 'delete', { slotId: slot() })).status).toBe(200)
    } finally {
      if (LOCAL_LAUNCHER) localKv('delete', 'sync:entitlement')
    }
  })

  it.skipIf(!LOCAL_LAUNCHER)(
    'puts, lists, gets, streams changes to the other device, and deletes',
    async () => {
      localKv('put', 'sync:entitlement', 'everyone')
      try {
        const session = await openSession(undefined, CURRENT_APP)
        const phone = slot()
        const tablet = slot()

        const tabletLive = await openLive(
          { ...bearerHeaders(session), upgrade: 'websocket', 'x-ww-slot-id': tablet },
          '/accounts/v1/sync/live'
        )
        expect(tabletLive.status).toBe(101)
        if (tabletLive.status !== 101) return
        const hello = JSON.parse(await tabletLive.connection.next())
        expect(hello).toEqual({ type: 'hello', seq: 0 })
        tabletLive.connection.send('ping')
        expect(await tabletLive.connection.next()).toBe('pong')

        const bytes = randomBytes(200_000)
        const stored = await put(session, phone, bytes)
        expect(stored.status).toBe(200)
        expect(stored.body).toMatchObject({
          ok: true,
          etag: await sha256B64u(bytes),
          size: 200_000,
          seq: 1,
        })
        expect(JSON.parse(await tabletLive.connection.next())).toEqual({
          type: 'changed',
          seq: 1,
        })

        const listed = await syncOp(session, 'list')
        expect(listed.body).toMatchObject({
          ok: true,
          seq: 1,
          slots: [
            { slotId: phone, etag: stored.body.etag, size: 200_000, platform: 'dev', live: true },
          ],
        })

        const got = await httpBytes('/accounts/v1/sync/get', {
          json: { slotId: phone },
          headers: bearerHeaders(session),
        })
        expect(got.status).toBe(200)
        expect(got.bytes).toEqual(bytes)
        expect(got.headers.get('etag')).toBe(`"${stored.body.etag}"`)

        // A stale If-Match is refused; the current one goes through.
        await new Promise((resolve) => setTimeout(resolve, 2_100))
        const stale = await put(session, phone, randomBytes(10), {
          'if-match': `"${await sha256B64u(randomBytes(4))}"`,
        })
        expect(stale.status).toBe(412)
        const next = await put(session, phone, randomBytes(10), {
          'if-match': `"${stored.body.etag}"`,
        })
        expect(next.status).toBe(200)
        expect(JSON.parse(await tabletLive.connection.next())).toEqual({
          type: 'changed',
          seq: 2,
        })

        // The kill switch refuses reads and writes, never the delete.
        localKv('put', 'sync:enabled', 'false')
        try {
          const off = await syncOp(session, 'list')
          expect(off.status).toBe(503)
          expect(off.body.code).toBe('disabled')
        } finally {
          localKv('delete', 'sync:enabled')
        }

        expect((await syncOp(session, 'delete', { slotId: phone })).body).toEqual({
          ok: true,
          seq: 3,
        })
        expect(JSON.parse(await tabletLive.connection.next())).toEqual({
          type: 'changed',
          seq: 3,
        })
        expect((await syncOp(session, 'list')).body).toEqual({
          ok: true,
          seq: 3,
          slots: [],
        })
        tabletLive.connection.end()
      } finally {
        localKv('delete', 'sync:entitlement')
      }
    }
  )

  it.skipIf(!LOCAL_LAUNCHER)('sets, repeats, reads, and withdraws the Cloud Sync request', async () => {
    const session = await openSession(undefined, CURRENT_APP)
    const status = async () =>
      (await http('GET', '/accounts/v1/sync', { headers: bearerHeaders(session) })).body
    expect(await status()).toMatchObject({ ok: true, requestedAt: null })
    // A token alone can't ask.
    expect((await syncOp(session, 'request', { requested: true })).body.code).toBe('bad_request')
    const set = await syncOp(session, 'request', await askEnvelope(session))
    expect(set.status).toBe(200)
    expect(set.body).toEqual({ ok: true, requestedAt: expect.any(Number) })
    const repeat = await syncOp(session, 'request', await askEnvelope(session))
    expect(repeat.body).toEqual({ ok: true, requestedAt: set.body.requestedAt })
    expect(await status()).toMatchObject({ requestedAt: set.body.requestedAt })

    // Setting needs Cloud Sync on; clearing never does.
    localKv('put', 'sync:enabled', 'false')
    try {
      const off = await syncOp(session, 'request', await askEnvelope(session))
      expect(off.status).toBe(503)
      expect(off.body.code).toBe('disabled')
      expect((await syncOp(session, 'request', { requested: false })).body).toEqual({
        ok: true,
        requestedAt: null,
      })
    } finally {
      localKv('delete', 'sync:enabled')
    }
    expect(await status()).toMatchObject({ requestedAt: null })
    expect((await syncOp(session, 'request', { requested: 'yes' })).body.code).toBe('bad_request')
  })

  it.skipIf(!LOCAL_LAUNCHER)(
    'puts, lists, gets, and deletes a photo, telling the other device',
    async () => {
      const session = await openSession(undefined, CURRENT_APP)
      const phone = slot()
      const tablet = slot()
      expect((await put(session, phone, randomBytes(64))).status).toBe(200)
      const tabletLive = await openLive(
        { ...bearerHeaders(session), upgrade: 'websocket', 'x-ww-slot-id': tablet },
        '/accounts/v1/sync/live'
      )
      expect(tabletLive.status).toBe(101)
      if (tabletLive.status !== 101) return
      expect(JSON.parse(await tabletLive.connection.next())).toEqual({ type: 'hello', seq: 1 })

      const name = await sha256B64u(randomBytes(16))
      const meta = b64u(randomBytes(120))
      // Small, so it also fits a worker started with a tiny --photo-limit-bytes.
      const bytes = randomBytes(1_000)
      const sha256 = await sha256B64u(bytes)
      const photoPut = (body: Uint8Array) =>
        httpBytes('/accounts/v1/sync/photos/put', {
          bytes: body,
          headers: {
            ...bearerHeaders(session),
            'x-ww-photo-name': name,
            'x-ww-sha256': sha256,
            'x-ww-photo-meta': meta,
            'x-ww-slot-id': phone,
          },
        })
      const stored = await photoPut(bytes)
      expect(stored.status).toBe(200)
      expect(stored.body).toMatchObject({ ok: true, name, size: 1_000, sha256, existed: false })
      expect(JSON.parse(await tabletLive.connection.next())).toEqual({ type: 'changed', seq: 2 })
      expect((await photoPut(randomBytes(10))).body).toMatchObject({ existed: true, size: 1_000 })

      const listed = await syncOp(session, 'photos/list', {})
      expect(listed.body).toMatchObject({
        ok: true,
        photos: [{ name, size: 1_000, sha256, meta }],
        cursor: null,
      })
      const got = await httpBytes('/accounts/v1/sync/photos/get', {
        json: { name },
        headers: bearerHeaders(session),
      })
      expect(got.status).toBe(200)
      expect(got.bytes).toEqual(bytes)
      expect(got.headers.get('etag')).toBe(`"${sha256}"`)

      expect((await syncOp(session, 'photos/delete', { names: [name] })).body).toMatchObject({
        ok: true,
        usage: { bytes: 0, count: 0 },
      })
      expect(JSON.parse(await tabletLive.connection.next())).toEqual({ type: 'changed', seq: 3 })
      expect((await syncOp(session, 'photos/get', { name })).status).toBe(404)
      const usage = await http('GET', '/accounts/v1/sync/photos/usage', { headers: bearerHeaders(session) })
      expect(usage.body).toMatchObject({ ok: true, usage: { bytes: 0, count: 0 } })
      tabletLive.connection.end()
    }
  )
})


describe.skipIf(!DEV_BYPASS_TOKEN)('Cloud Sync record changes', () => {
  const change = () => ({ changeId: b64u(randomBytes(16)), blob: b64u(randomBytes(512)) })

  it('sends a change to the other device, folds it into the base, and refuses a signed-out session', async () => {
    const phone = await openSession(undefined, CURRENT_APP)
    const tablet = await openSession(phone.key, CURRENT_APP)
    const phoneSlot = slot()
    const tabletSlot = slot()
    expect((await put(phone, phoneSlot, randomBytes(2_000))).status).toBe(200)
    expect((await put(tablet, tabletSlot, randomBytes(2_000))).status).toBe(200)

    const live = await openLive(
      { ...bearerHeaders(tablet), upgrade: 'websocket', 'x-ww-slot-id': tabletSlot },
      '/accounts/v1/sync/live'
    )
    expect(live.status).toBe(101)
    if (live.status !== 101) return
    try {
      expect(JSON.parse(await live.connection.next())).toEqual({ type: 'hello', seq: 2 })

      // The catch-up on the socket: nothing new is the listing and no changes.
      live.connection.send(JSON.stringify({ type: 'sync', afterSequence: 2 }))
      const caught = JSON.parse(await live.connection.next())
      expect(caught).toMatchObject({
        type: 'sync',
        sequence: 2,
        changes: [],
        more: false,
        requestedAt: null,
      })
      expect(caught.slots).toHaveLength(2)

      // A change is a few hundred bytes and reaches the socket sealed.
      const first = change()
      const sent = await syncOp(phone, 'changes/put', { slotId: phoneSlot, ...first })
      expect(sent.status).toBe(200)
      expect(sent.body).toMatchObject({ ok: true, sequence: 3, tailCount: 1, tailBytes: 512 })
      expect(JSON.parse(await live.connection.next())).toEqual({
        type: 'change',
        change: {
          sequence: 3,
          slotId: phoneSlot,
          changeId: first.changeId,
          keyEpoch: 0,
          createdAt: expect.any(Number),
          blob: first.blob,
        },
      })

      // The same over HTTP, and a retry is the same change.
      const again = await syncOp(phone, 'changes/put', { slotId: phoneSlot, ...first })
      expect(again.body).toMatchObject({ sequence: 3, tailCount: 1 })
      const listed = await syncOp(tablet, 'changes/list', { slotId: tabletSlot, afterSequence: 2 })
      expect(listed.status).toBe(200)
      expect(listed.body).toMatchObject({
        ok: true,
        sequence: 3,
        more: false,
        changes: [{ sequence: 3, slotId: phoneSlot, changeId: first.changeId, blob: first.blob }],
      })
      // Its own slot's changes are left out.
      const own = await syncOp(phone, 'changes/list', { slotId: phoneSlot, afterSequence: 0 })
      expect(own.body.changes).toEqual([])

      // A malformed change, and a slot with no base.
      const unpadded = await syncOp(phone, 'changes/put', {
        slotId: phoneSlot,
        changeId: b64u(randomBytes(16)),
        blob: b64u(randomBytes(300)),
      })
      expect(unpadded.status).toBe(400)
      const noBase = await syncOp(phone, 'changes/put', { slotId: slot(), ...change() })
      expect([noBase.status, noBase.body.code]).toEqual([409, 'no_slot'])

      // The base folds the change in: devices past it don't read the base.
      await new Promise((resolve) => setTimeout(resolve, 2_100))
      const base = await put(phone, phoneSlot, randomBytes(2_000), {
        'x-ww-covers-sequence': '3',
      })
      expect(base.status).toBe(200)
      expect(base.body).toMatchObject({ seq: 4, floorSequence: 3 })
      expect(JSON.parse(await live.connection.next())).toEqual({ type: 'changed', seq: 4 })
      const folded = await syncOp(tablet, 'changes/list', { slotId: tabletSlot, afterSequence: 0 })
      expect(folded.body.changes).toEqual([])
      expect(
        folded.body.slots.find((each: { slotId: string }) => each.slotId === phoneSlot)
      ).toMatchObject({ floorSequence: 3 })

      // An app that reads only snapshots lists; the others are told.
      expect(folded.body.snapshotReaders).toBe(false)
      expect((await syncOp(tablet, 'list')).status).toBe(200)
      const told = await syncOp(phone, 'changes/put', { slotId: phoneSlot, ...change() })
      expect(told.body).toMatchObject({ sequence: 5, snapshotReaders: true })
      expect(JSON.parse(await live.connection.next())).toMatchObject({
        type: 'change',
        change: { sequence: 5 },
      })

      // Signed out: the token is still valid for minutes, but adds nothing.
      const closed = await http('DELETE', '/accounts/v1/sessions/current', {
        headers: bearerHeaders(tablet),
      })
      expect(closed.status).toBe(200)
      // Its socket closes at once.
      expect(await live.connection.closed).toEqual({ code: 4006, reason: 'session_ended' })
      const refused = await syncOp(tablet, 'changes/put', { slotId: tabletSlot, ...change() })
      expect(refused.status).toBe(401)
      expect((await syncOp(tablet, 'changes/list', { slotId: tabletSlot, afterSequence: 0 })).status).toBe(401)
      // The other device goes on.
      const after = await syncOp(phone, 'changes/put', { slotId: phoneSlot, ...change() })
      expect(after.status).toBe(200)
    } finally {
      live.connection.end()
      await syncOp(phone, 'delete')
    }
  })

  it.skipIf(!LOCAL_LAUNCHER)('refuses changes while the switch is off, and leaves snapshots alone', async () => {
    const session = await openSession(undefined, CURRENT_APP)
    const mine = slot()
    expect((await put(session, mine, randomBytes(500))).status).toBe(200)
    localKv('put', 'sync:changes', 'false')
    try {
      const off = await syncOp(session, 'changes/put', { slotId: mine, ...change() })
      expect([off.status, off.body.code]).toEqual([503, 'changes_disabled'])
      const read = await syncOp(session, 'changes/list', { slotId: mine, afterSequence: 0 })
      expect([read.status, read.body.code]).toEqual([503, 'changes_disabled'])
      const status = await http('GET', '/accounts/v1/sync', { headers: bearerHeaders(session) })
      expect(status.body).toMatchObject({ enabled: true, changes: false })
      expect((await http('GET', '/app/v1/config')).body.sync).toMatchObject({ changes: false })
      // Snapshots go on as before.
      expect((await syncOp(session, 'list')).status).toBe(200)
    } finally {
      localKv('delete', 'sync:changes')
      await syncOp(session, 'delete')
    }
  })
})
