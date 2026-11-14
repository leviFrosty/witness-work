import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createHarness,
  randomBytes,
  randomId,
  sha256B64u,
  TEST_WEB_ORIGIN,
  type Harness,
} from '../test/buddies'
import {
  bearer,
  liveTicket,
  openTestSession,
  postJson,
  requestJson,
  type TestSession,
} from '../test/accounts'
import type { FakeWebSocket } from '../test/durableObjects'
import { bytesToBase64Url } from '../crypto'
import { createAccountsRoutes } from './route'
import { resetSyncEntitlementCache } from './sync'
import { closeSession, resetSessionCapabilitiesCache } from './sessionStore'
import { accountsDb } from './store'
import { SYNC_CHANGE_LIMITS } from './syncContracts'
import { accountSupporterStatus } from './supporter'
import { accessTokenKeys, signAccessToken } from './tokens'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: DurableObjectState
    env: unknown
    constructor(ctx: DurableObjectState, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  },
}))

vi.mock('./supporter', async (original) => ({
  ...(await original<typeof import('./supporter')>()),
  accountSupporterStatus: vi.fn(),
}))

/**
 * Record changes (witness-work ADR 0060): a slot is a base and a tail of
 * small sealed changes, a device catches up from its cursor, and the live
 * socket carries the changes.
 */

const CURRENT_APP = { appVersion: '1.60.0', capabilities: ['sync-everyone'] }
const START = Date.UTC(2026, 10, 14, 12)
const SECOND = 1_000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE
const app = createAccountsRoutes()

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
  await h.kv.put('sync:changes', 'true')
  resetSyncEntitlementCache()
  resetSessionCapabilitiesCache()
  vi.mocked(accountSupporterStatus).mockReset()
  vi.mocked(accountSupporterStatus).mockResolvedValue({
    supporter: false,
    expiresAt: null,
    customers: 0,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)
const session = (key?: TestSession['key']) =>
  openTestSession(app as never, h.env, key, CURRENT_APP)
const slot = () => randomId().slice(0, 16)
const changeId = () => bytesToBase64Url(randomBytes(16))
/** A sealed change's stand-in: `blocks` 256-byte blocks, base64url. */
const blob = (blocks = 2) => bytesToBase64Url(randomBytes(256 * blocks))
const code = (body: unknown) => (body as { code?: string }).code

const request = (path: string, init: RequestInit) =>
  (app as { request: typeof fetch }).request(
    path,
    { duplex: 'half', ...init } as RequestInit,
    h.env as never
  )

/** A base put, as today's app does it. */
const putBase = async (
  s: TestSession,
  slotId: string,
  headers: Record<string, string> = {}
) => {
  const bytes = randomBytes(1_000)
  const response = await request('/sync/put', {
    method: 'POST',
    headers: {
      ...bearer(s.accessToken),
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'x-ww-slot-id': slotId,
      'x-ww-sha256': await sha256B64u(bytes),
      ...headers,
    },
    body: bytes,
  })
  return {
    status: response.status,
    body: (await response.json()) as Record<string, number>,
  }
}

const putChange = (
  s: Pick<TestSession, 'accessToken'>,
  slotId: string,
  fields: Record<string, unknown> = {}
) =>
  postJson(
    app as never,
    h.env,
    '/sync/changes/put',
    { slotId, changeId: changeId(), blob: blob(), ...fields },
    bearer(s.accessToken)
  )

type CatchUp = {
  sequence: number
  slots: { slotId: string; floorSequence: number; changedAt: number }[]
  changes: { sequence: number; slotId: string; changeId: string; blob: string }[]
  more: boolean
  snapshotReaders: boolean
  requestedAt: number | null
  photos: boolean
}

const catchUp = async (
  s: Pick<TestSession, 'accessToken'>,
  slotId: string,
  afterSequence = 0
) => {
  const response = await postJson(
    app as never,
    h.env,
    '/sync/changes/list',
    { slotId, afterSequence },
    bearer(s.accessToken)
  )
  return { status: response.status, body: response.body as CatchUp }
}

const legacyList = (s: TestSession) =>
  postJson(app as never, h.env, '/sync/list', {}, bearer(s.accessToken))

const live = async (s: Pick<TestSession, 'accessToken'>, slotId: string) => {
  const response = (await request('/sync/live', {
    method: 'GET',
    headers: {
      ...bearer(s.accessToken),
      upgrade: 'websocket',
      'x-ww-slot-id': slotId,
    },
  })) as Response & { webSocket?: FakeWebSocket | null }
  if (response.status !== 101) throw new Error(`live: ${response.status}`)
  return response.webSocket!
}

type Message = { type: string } & Record<string, unknown>
const messages = (socket: FakeWebSocket) => socket.messages<Message>()
const last = (socket: FakeWebSocket) => messages(socket).at(-1)
/** Lets the Durable Object's async socket handlers and background checks run. */
const settle = async () => {
  for (let turn = 0; turn < 5; turn++)
    await new Promise((resolve) => setImmediate(resolve))
}
const askSync = async (socket: FakeWebSocket, afterSequence = 0) => {
  socket.send(JSON.stringify({ type: 'sync', afterSequence }))
  await settle()
}

/** Two devices of one account, each with a base. */
const twoDevices = async () => {
  const phone = await session()
  const tablet = await session(phone.key)
  const phoneSlot = slot()
  const tabletSlot = slot()
  expect((await putBase(phone, phoneSlot)).status).toBe(200)
  expect((await putBase(tablet, tabletSlot)).status).toBe(200)
  return { phone, tablet, phoneSlot, tabletSlot }
}

describe('sync/changes/put and sync/changes/list', () => {
  it('stores a change in the slot’s tail and gives it to the other devices', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const id = changeId()
    const sealed = blob()

    const put = await putChange(phone, phoneSlot, { changeId: id, blob: sealed })
    expect(put.status).toBe(200)
    expect(put.body).toEqual({
      ok: true,
      sequence: 3,
      tailCount: 1,
      tailBytes: 512,
      snapshotReaders: false,
      changedAt: START,
    })

    const theirs = await catchUp(tablet, tabletSlot, 2)
    expect(theirs.status).toBe(200)
    expect(theirs.body).toMatchObject({
      sequence: 3,
      more: false,
      snapshotReaders: false,
      requestedAt: null,
      photos: true,
      changes: [
        {
          sequence: 3,
          slotId: phoneSlot,
          changeId: id,
          keyEpoch: 0,
          createdAt: START,
          blob: sealed,
        },
      ],
    })
    expect(theirs.body.slots.map((each) => each.slotId).sort()).toEqual(
      [phoneSlot, tabletSlot].sort()
    )
    // A device never gets its own changes back.
    expect((await catchUp(phone, phoneSlot, 0)).body.changes).toEqual([])
    // Nothing new: the listing and an empty list.
    expect((await catchUp(tablet, tabletSlot, 3)).body).toMatchObject({
      sequence: 3,
      changes: [],
      more: false,
    })
  })

  it('answers a retried change with the first put’s sequence', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const fields = { changeId: changeId(), blob: blob() }
    const first = await putChange(phone, phoneSlot, fields)
    const again = await putChange(phone, phoneSlot, fields)
    expect(again.status).toBe(200)
    expect(again.body).toEqual(first.body)
    expect((await catchUp(tablet, tabletSlot)).body.changes).toHaveLength(1)
  })

  it('reads no database and writes no object', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const objects = h.syncBlobs.objects.size
    const prepare = vi.spyOn(h.accountsDb!, 'prepare')
    const batch = vi.spyOn(h.accountsDb!, 'batch')
    expect((await putChange(phone, phoneSlot)).status).toBe(200)
    expect((await catchUp(tablet, tabletSlot)).status).toBe(200)
    expect(prepare).not.toHaveBeenCalled()
    expect(batch).not.toHaveBeenCalled()
    expect(h.syncBlobs.objects.size).toBe(objects)
  })

  it('needs a base, and a well-formed change', async () => {
    const s = await session()
    const mine = slot()
    const noBase = await putChange(s, mine)
    expect([noBase.status, code(noBase.body)]).toEqual([409, 'no_slot'])
    expect((await putBase(s, mine)).status).toBe(200)

    for (const fields of [
      { slotId: 'no' },
      { changeId: 'short' },
      { blob: bytesToBase64Url(randomBytes(300)) },
      { blob: '' },
      { blob: 'not base64url!' },
      { blob: 7 },
    ]) {
      const refused = await putChange(s, mine, fields)
      expect([fields, refused.status]).toEqual([fields, 400])
    }
    const big = await putChange(s, mine, {
      blob: 'A'.repeat(Math.ceil(((SYNC_CHANGE_LIMITS.blobBytes + 256) * 4) / 3) + 2_000),
    })
    expect([big.status, code(big.body)]).toEqual([413, 'too_large'])
    // The largest change fits.
    const largest = await putChange(s, mine, {
      blob: blob(SYNC_CHANGE_LIMITS.blobBytes / 256),
    })
    expect(largest.status).toBe(200)

    for (const body of [{ slotId: mine }, { slotId: mine, afterSequence: -1 }, { afterSequence: 0 }]) {
      const refused = await postJson(app as never, h.env, '/sync/changes/list', body, bearer(s.accessToken))
      expect(refused.status).toBe(400)
    }
    expect((await putChange({ accessToken: 'nope' }, mine)).status).toBe(401)
  })

  it('pages a long catch-up', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    // Three changes of 128 KiB: a page holds 256 KiB.
    const blocks = (128 * 1_024) / 256
    for (let n = 0; n < 3; n++)
      expect((await putChange(phone, phoneSlot, { blob: blob(blocks) })).status).toBe(200)
    const first = (await catchUp(tablet, tabletSlot, 0)).body
    expect(first.changes.map((change) => change.sequence)).toEqual([3, 4])
    expect(first.more).toBe(true)
    const rest = (await catchUp(tablet, tabletSlot, 4)).body
    expect(rest.changes.map((change) => change.sequence)).toEqual([5])
    expect(rest).toMatchObject({ more: false, sequence: 5 })
  })

  it('answers an account that never synced with nothing', async () => {
    const s = await session()
    expect((await catchUp(s, slot())).body).toEqual({
      ok: true,
      sequence: 0,
      slots: [],
      changes: [],
      more: false,
      snapshotReaders: false,
      requestedAt: null,
      photos: true,
    })
  })
})

describe('the switch', () => {
  it('refuses the change routes while off, and leaves snapshots alone', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    await h.kv.put('sync:changes', 'false')
    for (const refused of [
      await putChange(phone, phoneSlot),
      await catchUp(tablet, tabletSlot),
      await postJson(
        app as never,
        h.env,
        '/sync/changes/reseal',
        { sequence: 1, changeId: changeId(), blob: blob() },
        bearer(phone.accessToken)
      ),
    ])
      expect([refused.status, code(refused.body)]).toEqual([503, 'changes_disabled'])

    advance(3 * SECOND)
    expect((await putBase(phone, phoneSlot)).status).toBe(200)
    expect((await legacyList(tablet)).status).toBe(200)
    const socket = await live(tablet, tabletSlot)
    await askSync(socket)
    expect(last(socket)).toEqual({ type: 'error', error: 'changes_disabled' })

    const status = await requestJson(app as never, h.env, 'GET', '/sync', undefined, bearer(phone.accessToken))
    expect(status.body).toMatchObject({ enabled: true, changes: false })
    await h.kv.put('sync:changes', 'on')
    const on = await requestJson(app as never, h.env, 'GET', '/sync', undefined, bearer(phone.accessToken))
    expect(on.body).toMatchObject({ changes: true })
  })

  it('is off unless something turns it on', async () => {
    await h.kv.delete('sync:changes')
    const s = await session()
    const mine = slot()
    expect((await putBase(s, mine)).status).toBe(200)
    expect(code((await putChange(s, mine)).body)).toBe('changes_disabled')
  })

  it('keeps the Supporter rule for a session without sync-everyone', async () => {
    const old = await openTestSession(app as never, h.env)
    const refused = await putChange(old, slot())
    expect([refused.status, code(refused.body)]).toEqual([403, 'supporter_required'])
  })
})

describe('the base and its tail', () => {
  it('folds the changes a base covers, and keeps the ones after', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const sequences: number[] = []
    for (let n = 0; n < 3; n++)
      sequences.push((await putChange(phone, phoneSlot)).body.sequence as number)
    expect(sequences).toEqual([3, 4, 5])

    advance(3 * SECOND)
    const base = await putBase(phone, phoneSlot, { 'x-ww-covers-sequence': '4' })
    expect(base.body).toMatchObject({ seq: 6, floorSequence: 4 })

    const after = (await catchUp(tablet, tabletSlot, 0)).body
    expect(after.changes.map((change) => change.sequence)).toEqual([5])
    expect(after.slots.find((each) => each.slotId === phoneSlot)).toMatchObject({
      floorSequence: 4,
    })
    expect((await putChange(phone, phoneSlot)).body).toMatchObject({ tailCount: 2 })
  })

  it('replaces the whole tail with a base that names no change', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    await putChange(phone, phoneSlot)
    await putChange(phone, phoneSlot)
    advance(3 * SECOND)
    // What an app from before record changes puts.
    const base = await putBase(phone, phoneSlot)
    expect(base.body).toMatchObject({ seq: 5, floorSequence: 5 })
    const after = (await catchUp(tablet, tabletSlot, 4)).body
    expect(after.changes).toEqual([])
    expect(after.slots.find((each) => each.slotId === phoneSlot)).toMatchObject({
      floorSequence: 5,
    })
  })

  it('never moves a floor back, and refuses a malformed header', async () => {
    const s = await session()
    const mine = slot()
    expect((await putBase(s, mine)).body).toMatchObject({ seq: 1, floorSequence: 1 })
    advance(3 * SECOND)
    expect((await putBase(s, mine, { 'x-ww-covers-sequence': '0' })).body).toMatchObject({
      floorSequence: 1,
    })
    advance(3 * SECOND)
    // Past the account's sequence: no more than the put's own.
    expect((await putBase(s, mine, { 'x-ww-covers-sequence': '999' })).body).toMatchObject({
      seq: 3,
      floorSequence: 3,
    })
    advance(3 * SECOND)
    expect((await putBase(s, mine, { 'x-ww-covers-sequence': 'x' })).status).toBe(400)
    expect((await putBase(s, mine, { 'x-ww-covers-sequence': '-1' })).status).toBe(400)
  })

  it('refuses a change once the tail is full', async () => {
    const s = await session()
    const mine = slot()
    expect((await putBase(s, mine)).status).toBe(200)
    for (let n = 0; n < SYNC_CHANGE_LIMITS.tailChanges; n++) {
      // 60 a minute.
      if (n > 0 && n % 60 === 0) advance(MINUTE)
      expect((await putChange(s, mine)).status).toBe(200)
    }
    advance(MINUTE)
    const full = await putChange(s, mine)
    expect([full.status, code(full.body)]).toEqual([409, 'tail_full'])
    const last = (await catchUp(s, slot())).body.sequence
    expect((await putBase(s, mine, { 'x-ww-covers-sequence': String(last) })).status).toBe(200)
    expect((await putChange(s, mine)).body).toMatchObject({ tailCount: 1 })
  })

  it('limits a slot to 60 changes a minute', async () => {
    const s = await session()
    const mine = slot()
    expect((await putBase(s, mine)).status).toBe(200)
    advance(20 * SECOND)
    for (let n = 0; n < SYNC_CHANGE_LIMITS.slotChangesPerMinute; n++)
      expect((await putChange(s, mine)).status).toBe(200)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const limited = await putChange(s, mine)
    expect([limited.status, code(limited.body)]).toEqual([429, 'rate_limited'])
    expect(limited.headers.get('retry-after')).toBe('40')
    advance(40 * SECOND)
    expect((await putChange(s, mine)).status).toBe(200)
  })

  it('deletes a slot’s tail with the slot', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    await putChange(phone, phoneSlot)
    const deleted = await postJson(
      app as never,
      h.env,
      '/sync/delete',
      { slotId: phoneSlot },
      bearer(phone.accessToken)
    )
    expect(deleted.status).toBe(200)
    expect((await catchUp(tablet, tabletSlot, 0)).body.changes).toEqual([])
    expect(h.syncIndexes.storage(phone.accountId).query('SELECT * FROM change')).toEqual([])
  })
})

describe('devices that read only snapshots', () => {
  it('says so for 14 days after a session lists without the header', async () => {
    const { phone, tablet, phoneSlot } = await twoDevices()
    // A list from an app that reads changes doesn't count.
    await postJson(app as never, h.env, '/sync/list', {}, {
      ...bearer(tablet.accessToken),
      'x-ww-sync-changes': '1',
    })
    expect((await putChange(phone, phoneSlot)).body).toMatchObject({ snapshotReaders: false })

    expect((await legacyList(tablet)).status).toBe(200)
    advance(MINUTE)
    expect((await putChange(phone, phoneSlot)).body).toMatchObject({ snapshotReaders: true })
    // Another session's catch-up doesn't speak for the tablet.
    expect((await catchUp(phone, phoneSlot)).body.snapshotReaders).toBe(true)

    advance(SYNC_CHANGE_LIMITS.snapshotReaderMs)
    const later = await session(phone.key)
    expect((await putChange(later, phoneSlot)).body).toMatchObject({ snapshotReaders: false })
  })

  it('stops counting a session once its app reads changes', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    await legacyList(phone)
    await legacyList(tablet)
    // The phone updated: its catch-up says so, and the tablet still counts.
    expect((await catchUp(phone, phoneSlot)).body.snapshotReaders).toBe(true)
    expect((await catchUp(tablet, tabletSlot)).body.snapshotReaders).toBe(false)
    expect((await putChange(phone, phoneSlot)).body).toMatchObject({ snapshotReaders: false })

    // A list with the header says it too, and so does a socket's catch-up.
    await legacyList(tablet)
    await postJson(app as never, h.env, '/sync/list', {}, {
      ...bearer(tablet.accessToken),
      'x-ww-sync-changes': '1',
    })
    expect((await putChange(phone, phoneSlot)).body).toMatchObject({ snapshotReaders: false })
    await legacyList(tablet)
    expect((await putChange(phone, phoneSlot)).body).toMatchObject({ snapshotReaders: true })
    const socket = await live(tablet, tabletSlot)
    await askSync(socket)
    expect((await putChange(phone, phoneSlot)).body).toMatchObject({ snapshotReaders: false })
  })

  it('stops counting a session that ended', async () => {
    const { phone, tablet, phoneSlot } = await twoDevices()
    await legacyList(tablet)
    expect((await putChange(phone, phoneSlot)).body).toMatchObject({ snapshotReaders: true })
    const closed = await requestJson(app as never, h.env, 'DELETE', '/sessions/current', undefined, bearer(tablet.accessToken))
    expect(closed.status).toBe(200)
    expect((await putChange(phone, phoneSlot)).body).toMatchObject({ snapshotReaders: false })
  })
})

describe('sessions that ended', () => {
  it('refuses a signed-out session’s last token, with no database read', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const closed = await requestJson(app as never, h.env, 'DELETE', '/sessions/current', undefined, bearer(tablet.accessToken))
    expect(closed.status).toBe(200)

    const prepare = vi.spyOn(h.accountsDb!, 'prepare')
    const put = await putChange(tablet, tabletSlot)
    expect([put.status, code(put.body)]).toEqual([401, 'unauthorized'])
    expect((await catchUp(tablet, tabletSlot)).status).toBe(401)
    expect(prepare).not.toHaveBeenCalled()
    // The other device isn't touched.
    expect((await putChange(phone, phoneSlot)).status).toBe(200)
  })

  it('refuses a session another device signed out, and closes its socket', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const lost = await live(tablet, tabletSlot)
    const kept = await live(phone, phoneSlot)
    const revoked = await postJson(
      app as never,
      h.env,
      '/sessions/revoke',
      { sessionId: tablet.sessionId },
      bearer(phone.accessToken)
    )
    expect(revoked.status).toBe(200)
    await settle()
    expect(lost.closedBy).toEqual({ code: 4006, reason: 'session_ended' })
    expect(kept.closedBy).toBeNull()
    expect((await putChange(tablet, tabletSlot)).status).toBe(401)
    // A socket can't be opened with the ended session's token either.
    await expect(live(tablet, tabletSlot)).rejects.toThrow('live: 401')
  })

  it('forgets an ended session once its last token has expired', async () => {
    const { tablet } = await twoDevices()
    await requestJson(app as never, h.env, 'DELETE', '/sessions/current', undefined, bearer(tablet.accessToken))
    const storage = h.syncIndexes.storage(tablet.accountId)
    expect(storage.query('SELECT session_id FROM ended_session')).toHaveLength(1)
    advance(SYNC_CHANGE_LIMITS.endedSessionMs + SECOND)
    // The next notice clears what lapsed.
    await h.syncIndexes.object(tablet.accountId).sessionsEnded({ sessionIds: [] })
    expect(storage.query('SELECT session_id FROM ended_session')).toEqual([])
  })

  it('refuses a token from before a key change, and learns the epoch from a token', async () => {
    const { phone, phoneSlot } = await twoDevices()
    const keys = (await accessTokenKeys(h.env as never))!
    const token = (keyEpoch: number) =>
      signAccessToken(keys, {
        accountId: phone.accountId,
        sessionId: phone.sessionId,
        platform: 'dev',
        keyEpoch,
        capabilities: ['sync-everyone'],
      })

    // The rekey route's notice.
    await h.syncIndexes.object(phone.accountId).closeForKeyChange({ keyEpoch: 1 })
    const old = await putChange(phone, phoneSlot)
    expect(old.status).toBe(401)
    expect(old.body).toMatchObject({ code: 'unauthorized', reason: 'key_changed' })
    expect((await catchUp(phone, phoneSlot)).body).toMatchObject({ reason: 'key_changed' })

    const current = await token(1)
    const put = await putChange(current, phoneSlot)
    expect(put.status).toBe(200)

    // A notice that was lost: the next token after the change tells it.
    const next = await token(2)
    expect((await putChange(next, phoneSlot)).status).toBe(200)
    expect((await putChange(current, phoneSlot)).body).toMatchObject({ reason: 'key_changed' })
    // A change says which key sealed it.
    const other = await session(phone.key)
    const read = await catchUp(await signAccessToken(keys, {
      accountId: other.accountId,
      sessionId: other.sessionId,
      platform: 'dev',
      keyEpoch: 2,
      capabilities: ['sync-everyone'],
    }), slot())
    expect(read.body.changes.map((change) => (change as { keyEpoch?: number }).keyEpoch)).toEqual([1, 2])
  })
})

describe('the live socket', () => {
  it('answers a catch-up, then carries the other devices’ changes', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const before = await putChange(phone, phoneSlot)
    const socket = await live(tablet, tabletSlot)
    expect(messages(socket)).toEqual([{ type: 'hello', seq: 3 }])

    await askSync(socket, 2)
    expect(last(socket)).toMatchObject({
      type: 'sync',
      sequence: 3,
      more: false,
      changes: [{ sequence: 3, slotId: phoneSlot }],
    })
    expect(before.body.sequence).toBe(3)

    const id = changeId()
    const sealed = blob()
    expect((await putChange(phone, phoneSlot, { changeId: id, blob: sealed })).status).toBe(200)
    expect(last(socket)).toEqual({
      type: 'change',
      change: {
        sequence: 4,
        slotId: phoneSlot,
        changeId: id,
        keyEpoch: 0,
        createdAt: START,
        blob: sealed,
      },
    })

    // Its own change doesn't come back.
    const count = messages(socket).length
    expect((await putChange(tablet, tabletSlot)).status).toBe(200)
    expect(messages(socket)).toHaveLength(count)
  })

  it('sends a socket that never asked only notices, as before', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const socket = await live(tablet, tabletSlot)
    expect((await putChange(phone, phoneSlot)).status).toBe(200)
    expect(messages(socket)).toEqual([{ type: 'hello', seq: 2 }])
    advance(3 * SECOND)
    expect((await putBase(phone, phoneSlot)).status).toBe(200)
    expect(last(socket)).toEqual({ type: 'changed', seq: 4 })
  })

  it('tells a socket that reads changes about a base put, too', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const socket = await live(tablet, tabletSlot)
    await askSync(socket, 2)
    advance(3 * SECOND)
    expect((await putBase(phone, phoneSlot)).status).toBe(200)
    expect(last(socket)).toEqual({ type: 'changed', seq: 3 })
  })

  it('ignores anything that isn’t a catch-up, and refuses a bad one', async () => {
    const { tablet, tabletSlot } = await twoDevices()
    const socket = await live(tablet, tabletSlot)
    for (const text of ['hi', '{"type":"other"}', '[]', 'x'.repeat(300)]) {
      socket.send(text)
      await settle()
    }
    expect(messages(socket)).toHaveLength(1)
    socket.send(JSON.stringify({ type: 'sync', afterSequence: -1 }))
    await settle()
    expect(last(socket)).toEqual({ type: 'error', error: 'bad_request' })
  })

  it('checks the session again before a change goes to a socket older than its token', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const socket = await live(tablet, tabletSlot)
    await askSync(socket, 2)
    // Past the token that opened the socket.
    advance(16 * MINUTE)
    const fresh = await signAccessToken((await accessTokenKeys(h.env as never))!, {
      accountId: phone.accountId,
      sessionId: phone.sessionId,
      platform: 'dev',
      capabilities: ['sync-everyone'],
    })
    const prepare = vi.spyOn(h.accountsDb!, 'prepare')

    const count = messages(socket).length
    expect((await putChange(fresh, phoneSlot)).status).toBe(200)
    // The check runs beside the writer's answer, never before it.
    await settle()
    expect(prepare).toHaveBeenCalled()
    // Still live: it's told to catch up, and gets the next change directly.
    expect(messages(socket).slice(count)).toEqual([{ type: 'changed', seq: 3 }])
    prepare.mockClear()
    expect((await putChange(fresh, phoneSlot)).status).toBe(200)
    expect(last(socket)).toMatchObject({ type: 'change', change: { sequence: 4 } })
    expect(prepare).not.toHaveBeenCalled()
  })

  it('closes a socket whose session ended without a notice, and sends it nothing', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const socket = await live(tablet, tabletSlot)
    await askSync(socket, 2)
    // The session ends in the database only: the notice was lost.
    await closeSession(accountsDb(h.accountsDb as never), tablet.accountId, tablet.sessionId)
    advance(16 * MINUTE)
    const fresh = await signAccessToken((await accessTokenKeys(h.env as never))!, {
      accountId: phone.accountId,
      sessionId: phone.sessionId,
      platform: 'dev',
      capabilities: ['sync-everyone'],
    })
    const count = messages(socket).length
    expect((await putChange(fresh, phoneSlot)).status).toBe(200)
    await settle()
    expect(socket.closedBy).toEqual({ code: 4006, reason: 'session_ended' })
    expect(messages(socket)).toHaveLength(count)
  })

  it('checks every socket again when a session opens, which may have replaced one', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const socket = await live(tablet, tabletSlot)
    await askSync(socket, 2)
    await closeSession(accountsDb(h.accountsDb as never), tablet.accountId, tablet.sessionId)
    // Any session open makes the index look again.
    await session(phone.key)
    await settle()
    expect(socket.closedBy).toEqual({ code: 4006, reason: 'session_ended' })
    expect(phoneSlot).not.toBe(tabletSlot)
  })

  it('gives a browser socket changes until its token expires', async () => {
    const { phone, phoneSlot } = await twoDevices()
    const browser = await openTestSession(app as never, h.env, phone.key, CURRENT_APP)
    const browserSlot = slot()
    const ticket = await liveTicket(app as never, h.env, browser, 'sync', browserSlot)
    const response = (await request('/sync/live', {
      method: 'GET',
      headers: {
        upgrade: 'websocket',
        origin: TEST_WEB_ORIGIN,
        'sec-websocket-protocol': `ww.v1, ticket.${ticket}`,
      },
    })) as Response & { webSocket?: FakeWebSocket | null }
    expect(response.status).toBe(101)
    const socket = response.webSocket!
    await askSync(socket, 0)
    expect(last(socket)).toMatchObject({ type: 'sync' })
    expect((await putChange(phone, phoneSlot)).status).toBe(200)
    expect(last(socket)).toMatchObject({ type: 'change' })
  })
})

describe('retention', () => {
  it('counts a change, and a catch-up, as the device’s last write', async () => {
    const { phone, tablet, phoneSlot, tabletSlot } = await twoDevices()
    const storage = h.syncIndexes.storage(phone.accountId)
    // Both sessions end; each slot is kept 30 days from its last write.
    for (const s of [phone, tablet])
      await closeSession(accountsDb(h.accountsDb as never), s.accountId, s.sessionId)

    advance(20 * DAY)
    const reader = await session(phone.key)
    // The phone's slot gets a change, the tablet's only a catch-up.
    expect((await putChange(reader, phoneSlot)).status).toBe(200)
    expect((await catchUp(reader, tabletSlot)).status).toBe(200)
    await closeSession(accountsDb(h.accountsDb as never), reader.accountId, reader.sessionId)

    advance(15 * DAY)
    await h.syncIndexes.fireAlarm(phone.accountId)
    expect(storage.query('SELECT slot_id FROM slot')).toHaveLength(2)

    advance(20 * DAY)
    await h.syncIndexes.fireAlarm(phone.accountId)
    expect(storage.query('SELECT slot_id FROM slot')).toEqual([])
    expect(storage.query('SELECT sequence FROM change')).toEqual([])
  })
})
