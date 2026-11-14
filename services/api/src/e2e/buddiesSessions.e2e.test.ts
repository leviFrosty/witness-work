import { afterAll, describe, expect, it } from 'vitest'
import {
  blobOfSize,
  envelope,
  photoBlob,
  randomBytes,
  randomId,
  relayError,
  unsignedEnvelope,
  b64u,
  type SigningKey,
} from '../test/buddiesClient'
import {
  ADMIN_TOKEN,
  BearerRelayOwner,
  DEV_BYPASS_TOKEN,
  LOCAL_LAUNCHER,
  RelayOwner,
  bearerHeaders,
  buddies,
  fieldsHeader,
  getBlob,
  http,
  localKv,
  type Exchange,
  openLive,
  openSession,
  sendWriter,
  writeTranscript,
} from '../test/e2e'
import { BUDDIES_ABUSE_LIMITS } from '../buddies/limits'

/**
 * The Buddies relay on account sessions (witness-work ADR 0027): sessions
 * opened through the dev bypass, then a bearer round trip (register with a
 * proof → slot/add → a buddy's event/put → owner sync → blob put/get → the
 * live socket's hello, changed, and pong), the account checks
 * (`not_linked`, `forbidden`), a bad token, and the legacy switch refusing
 * legacy requests with 426 while bearer ones work, except the iOS
 * Notification Service Extension's signed sync for a confirmed inbox.
 */

afterAll(() => {
  writeTranscript('buddies-sessions')
})

const DAY_MS = 24 * 60 * 60 * 1000

const inviteSecrets = async () => {
  const claimSecret = randomBytes(32)
  const verifier = new Uint8Array(await crypto.subtle.digest('SHA-256', claimSecret))
  return { inviteId: randomId(), claimSecret: b64u(claimSecret), claimVerifier: b64u(verifier) }
}

describe.skipIf(!DEV_BYPASS_TOKEN)('Buddies with bearer tokens (dev bypass)', () => {
  it('round-trips a relay session: register, slot, buddy event, sync, photo, live socket', async () => {
    const owner = await BearerRelayOwner.create(undefined, false)
    const registered = await owner.register()
    expect(registered.status).toBe(200)
    expect(registered.body).toEqual({ ok: true, accountId: owner.session.accountId })

    const buddy = await openSession()
    const writer = await owner.addWriter()

    const attempt = await openLive(owner.liveHeaders())
    expect(attempt.status).toBe(101)
    if (attempt.status !== 101 || !('connection' in attempt)) return
    const live = attempt.connection
    expect(JSON.parse(await live.next())).toEqual({ type: 'hello', seq: 0 })

    // The buddy writes with its own token plus the writer-signed envelope.
    const eventId = randomId()
    const put = await sendWriter(
      writer,
      'event/put',
      { eventId, kind: 'plan.invite', blob: blobOfSize(48), push: false },
      bearerHeaders(buddy)
    )
    expect(put.status).toBe(200)
    expect(put.body).toEqual({ ok: true, seq: 1 })
    expect(JSON.parse(await live.next())).toEqual({ type: 'changed', seq: 1 })

    const synced = await owner.sync(0)
    expect(synced.status).toBe(200)
    expect(synced.body).toMatchObject({
      ok: true,
      seq: 1,
      slots: [{ slotId: writer.slotId }],
      events: [{ eventId, slotId: writer.slotId, kind: 'plan.invite' }],
      capabilities: { photos: true },
    })
    // Repeating a bearer request is no replay: there is no nonce.
    expect((await owner.sync(1)).body).toMatchObject({ ok: true, events: [] })
    expect((await owner.sync(1)).status).toBe(200)

    const photo = await photoBlob(64 * 1_024)
    const expiresAt = Date.now() + 7 * DAY_MS
    const stored = await owner.putBlob(photo, owner.auth, { expiresAt })
    expect(stored.status).toBe(200)
    expect(stored.body).toEqual({ ok: true, expiresAt })
    const read = await getBlob(
      { inboxId: owner.inboxId, blobId: photo.blobId, token: photo.token },
      bearerHeaders(buddy)
    )
    expect(read.status).toBe(200)
    expect(read.bytes).toEqual(photo.bytes)

    live.send('ping')
    expect(await live.next()).toBe('pong')

    // An invite, fetched and claimed by the buddy with its token.
    const invite = await inviteSecrets()
    expect(
      (
        await owner.op('invite/create', {
          inviteId: invite.inviteId,
          claimVerifier: invite.claimVerifier,
          blob: blobOfSize(100),
          expiresAt: Date.now() + DAY_MS,
        })
      ).status
    ).toBe(200)
    const fetched = await http('POST', '/buddies/v1/invite/fetch', {
      headers: bearerHeaders(buddy),
      body: unsignedEnvelope({ inviteId: invite.inviteId }),
    })
    expect(fetched.body).toMatchObject({ ok: true, status: 'open' })
    const claimed = await http('POST', '/buddies/v1/invite/claim', {
      headers: bearerHeaders(buddy),
      body: unsignedEnvelope({
        inviteId: invite.inviteId,
        claimSecret: invite.claimSecret,
        blob: blobOfSize(80),
      }),
    })
    expect(claimed.body).toEqual({ ok: true })
    expect(JSON.parse(await live.next())).toEqual({ type: 'changed', seq: 2 })

    expect((await owner.op('blob/delete', { blobIds: [photo.blobId] })).body).toEqual({ ok: true })
    expect((await owner.op('inbox/delete')).body).toEqual({ ok: true })
    expect(await live.closed).toEqual({ code: 4001, reason: 'gone' })
    live.end()
  })

  it('answers not_linked for an inbox registered before accounts, until it links', async () => {
    const legacy = await RelayOwner.register()
    const owner = BearerRelayOwner.adopt(legacy, await openSession())
    expect(await owner.sync()).toMatchObject({ status: 409, body: relayError('not_linked') })
    expect(await openLive(owner.liveHeaders())).toEqual({
      status: 409,
      body: relayError('not_linked'),
    })
    const linked = await owner.register()
    expect(linked.body).toEqual({ ok: true, accountId: owner.session.accountId })
    expect((await owner.sync()).status).toBe(200)
    await owner.op('inbox/delete')
  })

  it("refuses another account's token on an inbox with forbidden", async () => {
    const owner = await BearerRelayOwner.create()
    await owner.addWriter()
    const stranger = bearerHeaders(await openSession())
    expect(await owner.sync(0, stranger)).toMatchObject({ status: 403, body: relayError('forbidden') })
    expect(await openLive(owner.liveHeaders(stranger))).toEqual({
      status: 403,
      body: relayError('forbidden'),
    })
    const refused = await owner.putBlob(await photoBlob(512), stranger)
    expect(refused.status).toBe(403)
    expect(refused.body).toEqual(relayError('forbidden'))
    // A proof for another account than the token's.
    const other = await openSession()
    expect(
      await owner.register({ account: await owner.proof(other) })
    ).toMatchObject({ status: 403, body: relayError('forbidden') })
    expect((await owner.sync()).status).toBe(200)
    await owner.op('inbox/delete')
  })

  it.skipIf(!ADMIN_TOKEN)("refuses a suspended account's writes into a buddy's inbox, but lets it leave", async () => {
    const owner = await BearerRelayOwner.create()
    const buddy = await openSession()
    const as = bearerHeaders(buddy)
    const writer = await owner.addWriter()
    const invite = await inviteSecrets()
    await owner.op('invite/create', {
      inviteId: invite.inviteId,
      claimVerifier: invite.claimVerifier,
      blob: blobOfSize(100),
      expiresAt: Date.now() + DAY_MS,
    })
    const card = () => sendWriter(writer, 'card/put', { blob: blobOfSize(64) }, as)
    const event = () =>
      sendWriter(
        writer,
        'event/put',
        { eventId: randomId(), kind: 'plan.invite', blob: blobOfSize(48), push: false },
        as
      )
    const claim = () =>
      http('POST', '/buddies/v1/invite/claim', {
        headers: as,
        body: unsignedEnvelope({
          inviteId: invite.inviteId,
          claimSecret: invite.claimSecret,
          blob: blobOfSize(80),
        }),
      })
    const setStatus = async (status: string) => {
      const res = await http('POST', '/admin/accounts/status', {
        headers: { 'x-ww-admin-token': ADMIN_TOKEN ?? '' },
        body: { accountId: buddy.accountId, status, reason: 'report' },
      })
      expect(res.status).toBe(200)
    }

    expect((await card()).body).toEqual({ ok: true, seq: 1 })
    expect((await event()).body).toEqual({ ok: true, seq: 2 })
    await setStatus('suspended')
    for (const refused of [await card(), await event(), await claim()]) {
      expect(refused.status).toBe(403)
      expect(refused.body).toEqual(relayError('suspended'))
    }
    const synced = await owner.sync()
    expect(synced.body).toMatchObject({ cards: [{ seq: 1 }], events: [{ seq: 2 }] })

    await setStatus('active')
    expect((await card()).body).toEqual({ ok: true, seq: 3 })
    expect((await claim()).status).toBe(200)

    await setStatus('suspended')
    expect((await sendWriter(writer, 'slot/leave', {}, as)).body).toEqual({ ok: true })
    await owner.op('inbox/delete')
  })

  it('refuses a bad token with 401 and a challenge, without trying the envelope', async () => {
    const owner = await BearerRelayOwner.create()
    const bad = await owner.sync(0, { authorization: 'Bearer expired.or.forged' })
    expect(bad.status).toBe(401)
    expect(bad.body).toEqual(relayError('unauthorized'))
    expect(bad.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"')
    // A bearer owner request is plain JSON, never an envelope.
    const enveloped = await buddies('inbox/sync', { payload: fieldsHeader({ inboxId: owner.inboxId, since: 0 }) })
    expect(enveloped.status).toBe(400)
    const withEnvelope = await http('POST', '/buddies/v1/inbox/sync', {
      headers: owner.auth,
      body: { payload: fieldsHeader({ inboxId: owner.inboxId, since: 0 }), signature: 'x' },
    })
    expect(withEnvelope.status).toBe(400)
    expect(withEnvelope.body).toEqual(relayError('bad_request'))
    // A signature header on a bearer upgrade is a mistake, not a fallback.
    expect(
      await openLive({ ...owner.liveHeaders(), 'x-buddies-signature': 'x' })
    ).toEqual({ status: 400, body: relayError('bad_request') })
    await owner.op('inbox/delete')
  })
})

describe.skipIf(!LOCAL_LAUNCHER || !DEV_BYPASS_TOKEN)('the legacy switch on Buddies (local KV)', () => {
  it('refuses every legacy request with 426, leaving included, while bearer requests work', async () => {
    const legacy = await RelayOwner.register()
    const legacyWriter = await legacy.addWriter()
    const owner = await BearerRelayOwner.create()
    const writer = await owner.addWriter()
    try {
      localKv('put', 'auth:legacy', 'off')
      const refused = await legacy.sync()
      expect(refused.status).toBe(426)
      expect(refused.body).toEqual(relayError('upgrade_required'))
      expect(refused.headers.get('retry-after')).toBeNull()
      expect((await legacy.send('inbox/delete')).status).toBe(426)
      expect((await legacy.send('slot/remove', { slotId: legacyWriter.slotId })).status).toBe(426)
      expect((await legacyWriter.send('slot/leave')).status).toBe(426)
      expect((await legacy.send('inbox/register', { ownerPub: legacy.key.publicKey })).status).toBe(426)
      expect((await buddies('invite/fetch', unsignedEnvelope({ inviteId: randomId() }))).status).toBe(426)
      expect(await openLive(await legacy.liveHeaders())).toEqual({
        status: 426,
        body: relayError('upgrade_required'),
      })
      expect((await legacy.putBlob(await photoBlob(512))).status).toBe(426)
      expect((await legacy.getBlob(await photoBlob(512))).status).toBe(426)

      expect((await owner.sync()).status).toBe(200)
      expect(
        (await sendWriter(writer, 'card/put', { blob: blobOfSize(64) }, owner.auth)).status
      ).toBe(200)
      const attempt = await openLive(owner.liveHeaders())
      expect(attempt.status).toBe(101)
      if ('connection' in attempt) attempt.connection.end()
      expect((await owner.op('inbox/delete')).status).toBe(200)
    } finally {
      // Back to the suites' default: on (see src/test/e2eGlobalSetup.ts).
      localKv('put', 'auth:legacy', 'on')
    }
    expect((await legacy.send('inbox/delete')).status).toBe(200)
  })

  it('still serves the Notification Service Extension’s signed sync for a confirmed inbox', async () => {
    const extension = { 'x-buddies-client': 'notification-service' }
    const extensionSync = async (
      who: { inboxId: string; key: SigningKey },
      headers: Record<string, string> = extension,
      op = 'inbox/sync'
    ) =>
      http('POST', `/buddies/v1/${op}`, {
        body: await envelope(
          op,
          { inboxId: who.inboxId, since: 0, ts: Date.now(), nonce: randomId() },
          who.key
        ),
        headers,
      })
    const owner = await BearerRelayOwner.create()
    const writer = await owner.addWriter()
    const unlinked = await RelayOwner.register()
    try {
      localKv('put', 'auth:legacy', 'off')
      const served = await extensionSync(owner)
      expect(served.status).toBe(200)
      expect(served.body).toMatchObject({ ok: true, seq: 0 })
      expect((served.body as { slots: unknown[] }).slots).toEqual([
        expect.objectContaining({ slotId: writer.slotId }),
      ])

      expect(await extensionSync(owner, {})).toMatchObject({
        status: 426,
        body: relayError('upgrade_required'),
      })
      expect(await extensionSync(unlinked)).toMatchObject({
        status: 426,
        body: relayError('upgrade_required'),
      })
      expect((await extensionSync(owner, extension, 'inbox/delete')).status).toBe(426)
      expect((await owner.sync()).status).toBe(200)
    } finally {
      // Back to the suites' default: on (see src/test/e2eGlobalSetup.ts).
      localKv('put', 'auth:legacy', 'on')
    }
    expect((await owner.op('inbox/delete')).status).toBe(200)
    expect((await unlinked.send('inbox/delete')).status).toBe(200)
  })
})

describe.skipIf(!LOCAL_LAUNCHER || !DEV_BYPASS_TOKEN)('per-account limits (local caller IPs)', () => {
  /**
   * Up to `2 × limit + 1` requests; the first `limit` always pass, and a 429
   * must come by the end even if a minute boundary falls mid-burst.
   */
  const burst = async (limit: number, send: () => Promise<Exchange>) => {
    const statuses: number[] = []
    for (let i = 0; i < 2 * limit + 1; i++) {
      const res = await send()
      statuses.push(res.status)
      if (res.status === 429) return { statuses, refused: res }
    }
    return { statuses, refused: null }
  }

  it('counts a bearer caller by its account, from any address, apart from others on the same one', async () => {
    const limit = BUDDIES_ABUSE_LIMITS.edge.unsigned.perMinute
    const [first, second] = [await openSession(), await openSession()]
    const fetchAs = (headers: Record<string, string>, ip?: string) =>
      http('POST', '/buddies/v1/invite/fetch', {
        body: unsignedEnvelope({ inviteId: randomId() }),
        headers: { ...headers, ...(ip ? { 'cf-connecting-ip': ip } : {}) },
      })
    // Every request comes from a fresh address (the helper rotates them).
    const { statuses, refused } = await burst(limit, () => fetchAs(bearerHeaders(first)))
    expect(statuses.slice(0, limit).every((s) => s === 404)).toBe(true)
    expect(refused?.body).toEqual(relayError('rate_limited'))
    expect(refused?.headers.get('retry-after')).toBe('60')
    // Another account, and a legacy caller, from the address that was refused last.
    const shared = '198.18.250.250'
    expect((await fetchAs(bearerHeaders(first), shared)).status).toBe(429)
    expect((await fetchAs(bearerHeaders(second), shared)).status).toBe(404)
    expect((await fetchAs({}, shared)).status).toBe(404)
  }, 60_000)
})
