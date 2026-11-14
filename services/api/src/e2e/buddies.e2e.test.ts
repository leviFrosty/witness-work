import { afterAll, describe, expect, it } from 'vitest'
import {
  SigningKey,
  b64u,
  blobOfSize,
  blobPutHeaders,
  envelope,
  photoBlob,
  randomBytes,
  randomId,
  unsignedEnvelope,
  relayError,
} from '../test/buddiesClient'
import {
  LOCAL_LAUNCHER,
  RelayOwner,
  RelayWriter,
  buddies,
  getBlob,
  http,
  httpBytes,
  localKv,
  openLive,
  sendSigned,
  sendUnsigned,
  writeTranscript,
  type Exchange,
} from '../test/e2e'
import { BUDDIES_ABUSE_LIMITS } from '../buddies/limits'
import { BUDDIES_LIMITS } from '../buddies/contracts'

/**
 * Two synthetic identities pair through the live relay following the
 * protocol's pairing sequence (docs/buddies-protocol.md), with read-backs via
 * `inbox/sync` after every write. Blobs are random bytes: the relay is blind.
 */

afterAll(() => {
  writeTranscript('buddies')
})

const DAY_MS = 24 * 60 * 60 * 1000

const inviteSecrets = async () => {
  const claimSecret = randomBytes(32)
  const verifier = new Uint8Array(await crypto.subtle.digest('SHA-256', claimSecret))
  return { inviteId: randomId(), claimSecret: b64u(claimSecret), claimVerifier: b64u(verifier) }
}

describe('pairing happy path', () => {
  it('register → invite → claim → confirm → cards → roster → leave → delete', async () => {
    // 1. Two people register inboxes; register is idempotent per key.
    const levi = await RelayOwner.register()
    const maria = await RelayOwner.register()
    expect((await levi.send('inbox/register', { ownerPub: levi.key.publicKey })).body).toEqual({ ok: true })
    const stranger = await SigningKey.generate()
    const hijack = await sendSigned('inbox/register', stranger, {
      inboxId: levi.inboxId,
      ownerPub: stranger.publicKey,
    })
    expect(hijack.status).toBe(409)
    expect(hijack.body).toEqual(relayError('conflict'))

    const empty = await levi.sync()
    expect(empty.status).toBe(200)
    expect(empty.body).toEqual({
      ok: true,
      seq: 0,
      slots: [],
      cards: [],
      events: [],
      roster: null,
      capabilities: { photos: true },
    })

    // 2. Levi registers a device (APNs is not configured locally: pushes skip).
    const device = await levi.send('device/register', {
      deviceId: randomId(),
      apnsToken: 'ab'.repeat(32),
      apnsEnvironment: 'sandbox',
      templates: {
        'invite.claimed': { title: 'Buddy request', body: 'Someone accepted your invite' },
        'pair.confirmed': { title: 'New buddy', body: 'You are now buddies' },
      },
    })
    expect(device.body).toEqual({ ok: true })

    // Maria's phone is Android: FCM instead of APNs (skipped locally without
    // the FCM key, like APNs).
    const android = await maria.send('device/register', {
      deviceId: randomId(),
      pushService: 'fcm',
      fcmToken: `${randomId()}:APA91b${b64u(randomBytes(96))}`,
      templates: {
        'pair.confirmed': { title: 'New buddy', body: 'You are now buddies' },
      },
    })
    expect(android.body).toEqual({ ok: true })

    // 3. Levi creates an invite.
    const invite = await inviteSecrets()
    const inviteCard = blobOfSize(256)
    const expiresAt = Date.now() + DAY_MS
    const created = await levi.send('invite/create', {
      inviteId: invite.inviteId,
      claimVerifier: invite.claimVerifier,
      blob: inviteCard,
      expiresAt,
    })
    expect(created.body).toEqual({ ok: true })

    // 4. Maria fetches the invite card.
    const fetched = await sendUnsigned('invite/fetch', { inviteId: invite.inviteId })
    expect(fetched.status).toBe(200)
    expect(fetched.body).toEqual({ ok: true, blob: inviteCard, expiresAt, status: 'open' })

    // 5. Maria accepts: registers the Levi→Maria slot in her inbox, then claims.
    const leviWriterKey = await SigningKey.generate()
    const leviToMaria = new RelayWriter(maria.inboxId, randomId(), leviWriterKey)
    expect(
      (await maria.send('slot/add', { slotId: leviToMaria.slotId, writerPub: leviWriterKey.publicKey })).body
    ).toEqual({ ok: true })
    const claimBlob = blobOfSize(200)
    const wrongClaim = await sendUnsigned('invite/claim', {
      inviteId: invite.inviteId,
      claimSecret: b64u(randomBytes(32)),
      blob: claimBlob,
    })
    expect(wrongClaim.status).toBe(401)
    const claimed = await sendUnsigned('invite/claim', {
      inviteId: invite.inviteId,
      claimSecret: invite.claimSecret,
      blob: claimBlob,
    })
    expect(claimed.status).toBe(200)
    expect(claimed.body).toEqual({ ok: true })
    // A retry of the same claim (its response was lost) gets the same ok …
    const retried = await sendUnsigned('invite/claim', {
      inviteId: invite.inviteId,
      claimSecret: invite.claimSecret,
      blob: claimBlob,
    })
    expect(retried.status).toBe(200)
    expect(retried.body).toEqual({ ok: true })
    // … but a freshly sealed claim is someone else's, even with the secret.
    const reclaim = await sendUnsigned('invite/claim', {
      inviteId: invite.inviteId,
      claimSecret: invite.claimSecret,
      blob: blobOfSize(200),
    })
    expect(reclaim.status).toBe(409)
    expect(reclaim.body).toEqual(relayError('conflict'))
    expect((await sendUnsigned('invite/fetch', { inviteId: invite.inviteId })).body.status).toBe('claimed')

    // 6. Levi syncs and sees the relay's invite.claimed event with Maria's claim blob.
    const afterClaim = await levi.sync()
    expect(afterClaim.status).toBe(200)
    expect(afterClaim.body.events).toEqual([
      expect.objectContaining({
        eventId: invite.inviteId,
        slotId: '',
        kind: 'invite.claimed',
        blob: claimBlob,
      }),
    ])

    // 7. Levi confirms: adds Maria→Levi slot, writes pair.confirmed + card into Maria's inbox, deletes the invite.
    const mariaWriterKey = await SigningKey.generate()
    const mariaToLevi = new RelayWriter(levi.inboxId, randomId(), mariaWriterKey)
    expect(
      (await levi.send('slot/add', { slotId: mariaToLevi.slotId, writerPub: mariaWriterKey.publicKey })).body
    ).toEqual({ ok: true })
    const confirmId = randomId()
    const confirmBlob = blobOfSize(64)
    const confirmed = await leviToMaria.send('event/put', {
      eventId: confirmId,
      kind: 'pair.confirmed',
      blob: confirmBlob,
      push: true,
    })
    expect(confirmed.status).toBe(200)
    const confirmSeq = confirmed.body.seq
    expect(confirmSeq).toBeGreaterThan(0)
    // Deduplicated on eventId: same seq back.
    const duplicate = await leviToMaria.send('event/put', {
      eventId: confirmId,
      kind: 'pair.confirmed',
      blob: confirmBlob,
      push: true,
    })
    expect(duplicate.body).toEqual({ ok: true, seq: confirmSeq })
    const leviCard = blobOfSize(1024)
    const leviCardPut = await leviToMaria.send('card/put', { blob: leviCard })
    expect(leviCardPut.status).toBe(200)
    expect((await levi.send('invite/delete', { inviteId: invite.inviteId })).body).toEqual({ ok: true })
    expect((await sendUnsigned('invite/fetch', { inviteId: invite.inviteId })).status).toBe(404)

    // 8. Maria's sync shows Levi's slot, confirmation, and card.
    const mariaSync = await maria.sync()
    expect(mariaSync.status).toBe(200)
    expect(mariaSync.body.slots).toEqual([
      { slotId: leviToMaria.slotId, createdAt: expect.any(Number) },
    ])
    expect(mariaSync.body.events).toEqual([
      expect.objectContaining({ eventId: confirmId, slotId: leviToMaria.slotId, kind: 'pair.confirmed', blob: confirmBlob, seq: confirmSeq }),
    ])
    expect(mariaSync.body.cards).toEqual([
      expect.objectContaining({ slotId: leviToMaria.slotId, blob: leviCard, seq: leviCardPut.body.seq }),
    ])
    // since = current seq returns nothing new.
    const mariaIdle = await maria.sync(mariaSync.body.seq)
    expect(mariaIdle.body).toMatchObject({ cards: [], events: [], roster: null })

    // 9. Maria writes her card into Levi's inbox; Levi reads only what's new.
    const leviBefore = afterClaim.body.seq
    const mariaCard = blobOfSize(2048)
    expect((await mariaToLevi.send('card/put', { blob: mariaCard })).status).toBe(200)
    const leviDelta = await levi.sync(leviBefore)
    expect(leviDelta.body.events).toEqual([])
    expect(leviDelta.body.cards).toEqual([
      expect.objectContaining({ slotId: mariaToLevi.slotId, blob: mariaCard }),
    ])

    // 10. Roster backup round-trips and is omitted once seen.
    const roster = blobOfSize(4096)
    const rosterPut = await levi.send('roster/put', { blob: roster })
    expect(rosterPut.status).toBe(200)
    const withRoster = await levi.sync(leviDelta.body.seq)
    expect(withRoster.body.roster).toEqual({ blob: roster, seq: rosterPut.body.seq })
    expect((await levi.sync(rosterPut.body.seq)).body.roster).toBeNull()

    // 11. Authentication holds on the live relay.
    const foreign = await sendSigned('inbox/sync', maria.key, { inboxId: levi.inboxId, since: 0 })
    expect(foreign.status).toBe(401)
    expect(foreign.body).toEqual(relayError('bad_signature'))
    const replayed = await envelope(
      'inbox/sync',
      { ts: Date.now(), nonce: randomId(), inboxId: levi.inboxId, since: 0 },
      levi.key
    )
    expect((await buddies('inbox/sync', replayed)).status).toBe(200)
    const replay = await buddies('inbox/sync', replayed)
    expect(replay.status).toBe(409)
    expect(replay.body).toEqual(relayError('replay'))
    const stale = await buddies(
      'inbox/sync',
      await envelope('inbox/sync', { ts: Date.now() - 6 * 60_000, nonce: randomId(), inboxId: levi.inboxId, since: 0 }, levi.key)
    )
    expect(stale.status).toBe(401)
    expect(stale.body).toEqual(relayError('stale'))
    const wrongSlot = new RelayWriter(levi.inboxId, randomId(), mariaWriterKey)
    expect((await wrongSlot.send('card/put', { blob: blobOfSize(8) })).status).toBe(410)

    // 12. Maria ends the connection from both sides.
    expect((await maria.send('slot/remove', { slotId: leviToMaria.slotId })).body).toEqual({ ok: true })
    expect((await mariaToLevi.send('slot/leave')).body).toEqual({ ok: true })
    const leviAfterLeave = await levi.sync()
    expect(leviAfterLeave.body.slots).toEqual([])
    expect(leviAfterLeave.body.cards).toEqual([])
    expect((await mariaToLevi.send('card/put', { blob: blobOfSize(8) })).status).toBe(410)
    expect((await leviToMaria.send('card/put', { blob: blobOfSize(8) })).status).toBe(410)

    // 13. Delete-all wipes both inboxes.
    expect((await levi.send('inbox/delete')).body).toEqual({ ok: true })
    expect((await maria.send('inbox/delete')).body).toEqual({ ok: true })
    const gone = await levi.sync()
    expect(gone.status).toBe(404)
    expect(gone.body).toEqual(relayError('not_found'))
  })
})

describe('inbox ownership across delete-all', () => {
  it('lets only the owner key register a deleted inbox again', async () => {
    const owner = await RelayOwner.register()
    const writerKey = await SigningKey.generate()
    const writer = new RelayWriter(owner.inboxId, randomId(), writerKey)
    const slot = { slotId: writer.slotId, writerPub: writerKey.publicKey }
    expect((await owner.send('slot/add', slot)).body).toEqual({ ok: true })
    expect((await writer.send('card/put', { blob: blobOfSize(8) })).status).toBe(200)

    const register = async (key: SigningKey) =>
      sendSigned('inbox/register', key, { inboxId: owner.inboxId, ownerPub: key.publicKey })
    const intruders = await Promise.all(Array.from({ length: 4 }, () => SigningKey.generate()))

    // Other keys racing the delete land before it (live owner) or after it (tombstone).
    const [deleted, ...raced] = await Promise.all([
      owner.send('inbox/delete'),
      ...intruders.map((key) => register(key)),
    ])
    expect(deleted.body).toEqual({ ok: true })
    for (const attempt of raced)
      expect(
        attempt.body
      ).toEqual(relayError('conflict'))

    expect((await register(intruders[0])).body).toEqual(relayError('conflict'))
    expect((await owner.sync()).body).toEqual(relayError('not_found'))
    const wiped = await writer.send('card/put', { blob: blobOfSize(8) })
    expect([wiped.status, wiped.body]).toEqual([404, relayError('not_found')])

    const back = await register(owner.key)
    expect([back.status, back.body]).toEqual([200, { ok: true }])
    expect((await owner.sync()).body).toEqual({
      ok: true,
      seq: 0,
      slots: [],
      cards: [],
      events: [],
      roster: null,
      capabilities: { photos: true },
    })
    const unslotted = await writer.send('card/put', { blob: blobOfSize(8) })
    expect(
      [unslotted.status, unslotted.body]
    ).toEqual([410, relayError('gone')])
    expect((await register(intruders[1])).body).toEqual(relayError('conflict'))

    expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })
  })
})

describe('relay limits and abuse', () => {
  const hex16 = () => Math.floor(Math.random() * 0x10000).toString(16)
  /** A random IPv6 /64 prefix nobody else uses (append `::<id>`). */
  const freshPrefix = () => `2001:db8:${hex16()}:${hex16()}`

  /**
   * Up to `2 × limit + 1` requests as one fresh caller. The first `limit`
   * always pass, and a 429 must come by the end even if a minute boundary
   * falls mid-burst (the limiter counts in fixed one-minute windows).
   */
  const burst = async (limit: number, send: (i: number) => Promise<Exchange>) => {
    const statuses: number[] = []
    for (let i = 0; i < 2 * limit + 1; i++) {
      const res = await send(i)
      statuses.push(res.status)
      if (res.status === 429) return { statuses, refused: res }
    }
    return { statuses, refused: null }
  }

  it('rate limits unsigned ops per caller, grouping IPv6 by /64', async () => {
    const limit = BUDDIES_ABUSE_LIMITS.edge.unsigned.perMinute
    const prefix = freshPrefix()
    const fetchFrom = (ip: string) =>
      http('POST', '/buddies/v1/invite/fetch', {
        body: unsignedEnvelope({ inviteId: randomId() }),
        headers: { 'cf-connecting-ip': ip },
      })
    // Every request comes from a different address in the same /64.
    const { statuses, refused } = await burst(limit, (i) =>
      fetchFrom(`${prefix}::${(i + 1).toString(16)}`)
    )
    expect(statuses.slice(0, limit).every((s) => s === 404)).toBe(true)
    expect(refused?.body).toEqual(relayError('rate_limited'))
    expect(refused?.headers.get('retry-after')).toBe('60')
    expect((await fetchFrom(`${freshPrefix()}::1`)).status).toBe(404)
  })

  it('rate limits inbox/register per caller', async () => {
    const limit = BUDDIES_ABUSE_LIMITS.edge.register.perMinute
    const ip = `${freshPrefix()}::1`
    const key = await SigningKey.generate()
    const inboxId = randomId()
    const { statuses, refused } = await burst(limit, async () =>
      http('POST', '/buddies/v1/inbox/register', {
        body: await envelope(
          'inbox/register',
          { inboxId, ownerPub: key.publicKey, ts: Date.now(), nonce: randomId() },
          key
        ),
        headers: { 'cf-connecting-ip': ip },
      })
    )
    // Re-registering is idempotent, and each one still counts.
    expect(statuses.slice(0, limit).every((s) => s === 200)).toBe(true)
    expect(refused?.body).toEqual(relayError('rate_limited'))
    expect(refused?.headers.get('retry-after')).toBe('60')
  })

  it('keys limits on the caller, so flooding an inbox never locks its owner out', async () => {
    const owner = await RelayOwner.register()
    const attacker = await SigningKey.generate()
    const ip = `${freshPrefix()}::66`
    const { statuses, refused } = await burst(
      BUDDIES_ABUSE_LIMITS.edge.read.perMinute,
      async () =>
        http('POST', '/buddies/v1/inbox/sync', {
          body: await envelope(
            'inbox/sync',
            { inboxId: owner.inboxId, since: 0, ts: Date.now(), nonce: randomId() },
            attacker
          ),
          headers: { 'cf-connecting-ip': ip },
        })
    )
    expect(statuses.filter((s) => s !== 429).every((s) => s === 401)).toBe(true)
    expect(refused?.body).toEqual(relayError('rate_limited'))
    const sync = await owner.sync()
    expect(sync.status).toBe(200)
    expect((await owner.send('inbox/delete')).status).toBe(200)
  }, 60_000)

  it('caps open invites', async () => {
    const owner = await RelayOwner.register()
    const statuses: number[] = []
    for (let i = 0; i <= BUDDIES_LIMITS.openInvites; i++) {
      const secrets = await inviteSecrets()
      const res = await owner.send('invite/create', {
        inviteId: secrets.inviteId,
        claimVerifier: secrets.claimVerifier,
        blob: blobOfSize(32),
        expiresAt: Date.now() + DAY_MS,
      })
      statuses.push(res.status)
    }
    expect(statuses).toEqual([
      ...Array<number>(BUDDIES_LIMITS.openInvites).fill(200),
      429,
    ])
    expect((await owner.send('inbox/delete')).status).toBe(200)
  })

  it('rejects unknown ops and GETs', async () => {
    expect((await buddies('inbox/explode', unsignedEnvelope({}))).status).toBe(404)
    expect((await http('GET', '/buddies/v1/inbox/sync')).status).toBe(404)
  })
})

describe('live socket', () => {
  it('says hello, signals each change, answers ping, and closes when the inbox is deleted', async () => {
    const owner = await RelayOwner.register()
    const writerKey = await SigningKey.generate()
    const slotId = randomId()
    expect((await owner.send('slot/add', { slotId, writerPub: writerKey.publicKey })).status).toBe(200)
    const writer = new RelayWriter(owner.inboxId, slotId, writerKey)

    const attempt = await openLive(await owner.liveHeaders())
    expect(attempt.status).toBe(101)
    if (attempt.status !== 101 || !('connection' in attempt)) return
    const live = attempt.connection
    expect(JSON.parse(await live.next())).toEqual({ type: 'hello', seq: 0 })

    const put = await writer.send('event/put', {
      eventId: randomId(),
      kind: 'plan.invite',
      blob: blobOfSize(48),
      push: true,
    })
    expect(put.body).toEqual({ ok: true, seq: 1 })
    expect(JSON.parse(await live.next())).toEqual({ type: 'changed', seq: 1 })
    expect((await writer.send('card/put', { blob: blobOfSize(64) })).body).toEqual({ ok: true, seq: 2 })
    expect(JSON.parse(await live.next())).toEqual({ type: 'changed', seq: 2 })
    // Read back: the signal's seq is what inbox/sync reports.
    const synced = await owner.sync(0)
    expect(synced.body.seq).toBe(2)
    expect(synced.body.events).toHaveLength(1)

    live.send('ping')
    expect(await live.next()).toBe('pong')

    expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })
    expect(await live.closed).toEqual({ code: 4001, reason: 'gone' })
    live.end()
  })

  it('refuses plain GETs, POSTs, bad signatures, and replays without upgrading', async () => {
    const owner = await RelayOwner.register()
    const headers = await owner.liveHeaders()
    const { upgrade: _upgrade, ...plain } = headers

    const notUpgraded = await http('GET', '/buddies/v1/inbox/live', { headers: plain })
    expect(notUpgraded.status).toBe(426)
    expect(notUpgraded.body).toEqual(relayError('upgrade_required'))
    expect((await http('POST', '/buddies/v1/inbox/live', { body: {} })).status).toBe(404)

    const first = await openLive(headers)
    expect(first.status).toBe(101)
    if ('connection' in first) first.connection.end()
    expect(
      await openLive(headers)
    ).toEqual({ status: 409, body: relayError('replay') })

    const stranger = await SigningKey.generate()
    expect(await openLive(await owner.liveHeaders(stranger))).toEqual({
      status: 401,
      body: relayError('bad_signature'),
    })
    expect(await openLive({ upgrade: 'websocket' })).toEqual({
      status: 400,
      body: relayError('bad_request'),
    })
    await owner.send('inbox/delete')
  })
})

describe('photo blobs', () => {
  it('refuses photos from an inbox with no buddies', async () => {
    const owner = await RelayOwner.register()
    const refused = await owner.putBlob(await photoBlob(512))
    expect(refused.status).toBe(403)
    expect(refused.body).toEqual(relayError('no_buddies'))
    await owner.send('inbox/delete')
  })

  it('put → get round trip, idempotent re-put, one 404 for every miss, delete', async () => {
    const owner = await RelayOwner.register()
    await owner.addWriter()
    expect((await owner.sync()).body.capabilities).toEqual({ photos: true })
    const photo = await photoBlob(200 * 1_024)
    const expiresAt = Date.now() + 7 * DAY_MS

    const put = await owner.putBlob(photo, { expiresAt })
    expect(put.status).toBe(200)
    expect(put.body).toEqual({ ok: true, expiresAt })

    // Read back the exact bytes, never cached.
    const got = await owner.getBlob(photo)
    expect(got.status).toBe(200)
    expect(got.bytes).toEqual(photo.bytes)
    expect(got.headers.get('content-type')).toBe('application/octet-stream')
    expect(got.headers.get('cache-control')).toBe('no-store')

    // A retry with an earlier expiry and another token changes nothing; a
    // later expiry moves it. The first token keeps working.
    const other = await photoBlob(16)
    const retry = await owner.putBlob(photo, {
      expiresAt: expiresAt - DAY_MS,
      readTokenHash: other.readTokenHash,
    })
    expect(retry.body).toEqual({ ok: true, expiresAt })
    const extended = await owner.putBlob(photo, { expiresAt: expiresAt + DAY_MS })
    expect(extended.body).toEqual({ ok: true, expiresAt: expiresAt + DAY_MS })
    expect((await owner.getBlob(photo)).bytes).toEqual(photo.bytes)

    // Wrong token, unknown blob, unknown inbox: the same 404.
    const misses = [
      await owner.getBlob(photo, other.token),
      await owner.getBlob(other),
      await getBlob({ inboxId: randomId(), blobId: photo.blobId, token: photo.token }),
    ]
    for (const miss of misses) {
      expect(miss.status).toBe(404)
      expect(miss.body).toEqual(relayError('not_found'))
    }

    // blob/delete, then the read is a 404 too.
    const deleted = await owner.send('blob/delete', { blobIds: [photo.blobId] })
    expect(deleted.body).toEqual({ ok: true })
    expect((await owner.getBlob(photo)).status).toBe(404)
    expect((await owner.send('blob/delete', { blobIds: [photo.blobId] })).body).toEqual({ ok: true })
    await owner.send('inbox/delete')
  })

  it('refuses mismatched bytes, oversize, bad signatures, and replays', async () => {
    const owner = await RelayOwner.register()
    await owner.addWriter()
    const photo = await photoBlob(4_096)

    const mismatch = await owner.putBlob(photo, {}, { bytes: randomBytes(4_096) })
    expect(mismatch.status).toBe(400)
    expect(mismatch.body).toEqual(relayError('bad_request'))

    // Signed `bytes` past 1 MiB: refused before the body is read.
    const oversize = await owner.putBlob(photo, { bytes: BUDDIES_LIMITS.blobBytes + 1 })
    expect(oversize.status).toBe(413)
    expect(oversize.body).toEqual(relayError('too_large'))
    // A declared body past 1 MiB is refused unread; a resendable request
    // drains wrangler dev's proxy afterwards (see the fuzzer's note).
    const big = await photoBlob(BUDDIES_LIMITS.blobBytes + 1)
    const declared = await owner.putBlob(big)
    expect(declared.status).toBe(413)
    expect(declared.body).toEqual(relayError('too_large'))
    await http('POST', '/verify-drain', { body: {} })

    const stranger = await SigningKey.generate()
    const forged = await httpBytes('/buddies/v1/blob/put', {
      bytes: photo.bytes,
      headers: await blobPutHeaders(
        {
          inboxId: owner.inboxId,
          blobId: photo.blobId,
          bytes: photo.bytes.byteLength,
          expiresAt: Date.now() + DAY_MS,
          readTokenHash: photo.readTokenHash,
          ts: Date.now(),
          nonce: randomId(),
        },
        stranger
      ),
    })
    expect(forged.status).toBe(401)
    expect(forged.body).toEqual(relayError('bad_signature'))

    const headers = await blobPutHeaders(
      {
        inboxId: owner.inboxId,
        blobId: photo.blobId,
        bytes: photo.bytes.byteLength,
        expiresAt: Date.now() + DAY_MS,
        readTokenHash: photo.readTokenHash,
        ts: Date.now(),
        nonce: randomId(),
      },
      owner.key
    )
    const first = await httpBytes('/buddies/v1/blob/put', { bytes: photo.bytes, headers })
    expect(first.status).toBe(200)
    const replay = await httpBytes('/buddies/v1/blob/put', { bytes: photo.bytes, headers })
    expect(replay.status).toBe(409)
    expect(replay.body).toEqual(relayError('replay'))
    expect((await owner.getBlob(photo)).bytes).toEqual(photo.bytes)
    await owner.send('inbox/delete')
  })

  it('purges an inbox’s blobs with inbox/delete', async () => {
    const owner = await RelayOwner.register()
    await owner.addWriter()
    const photo = await photoBlob(1_024)
    expect((await owner.putBlob(photo)).status).toBe(200)
    expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })
    // Even after the owner comes back, the blob is gone.
    expect((await owner.send('inbox/register', { ownerPub: owner.key.publicKey })).status).toBe(200)
    expect((await owner.getBlob(photo)).status).toBe(404)
    await owner.send('inbox/delete')
  })
})

describe.skipIf(!LOCAL_LAUNCHER)('photos switch (local KV)', () => {
  it('turns blob ops off with photos_disabled and reports it in inbox/sync', async () => {
    const owner = await RelayOwner.register()
    await owner.addWriter()
    const photo = await photoBlob(512)
    expect((await owner.putBlob(photo)).status).toBe(200)
    try {
      localKv('put', 'buddies:photos', 'off')
      const put = await owner.putBlob(await photoBlob(512))
      expect(put.status).toBe(503)
      expect(put.body).toEqual(relayError('photos_disabled'))
      expect(put.headers.get('retry-after')).toBe('60')
      expect((await owner.getBlob(photo)).body).toEqual(relayError('photos_disabled'))
      expect((await owner.send('blob/delete', { blobIds: [photo.blobId] })).status).toBe(503)
      expect((await owner.sync()).body.capabilities).toEqual({ photos: false })
    } finally {
      localKv('delete', 'buddies:photos')
    }
    expect((await owner.sync()).body.capabilities).toEqual({ photos: true })
    expect((await owner.getBlob(photo)).bytes).toEqual(photo.bytes)
    await owner.send('inbox/delete')
  })
})

describe.skipIf(!LOCAL_LAUNCHER)('kill switch (local KV)', () => {
  it('disables everything except leave/delete, then recovers', async () => {
    const owner = await RelayOwner.register()
    await owner.addWriter()
    try {
      localKv('put', 'buddies:enabled', 'false')
      const fresh = await SigningKey.generate()
      const blocked = await sendSigned('inbox/register', fresh, { inboxId: randomId(), ownerPub: fresh.publicKey })
      expect(blocked.status).toBe(503)
      expect(blocked.body).toEqual(relayError('disabled'))
      expect((await owner.sync()).body).toEqual(relayError('disabled'))
      expect(
        await openLive(await owner.liveHeaders())
      ).toEqual({ status: 503, body: relayError('disabled') })
      expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })
    } finally {
      localKv('delete', 'buddies:enabled')
    }
    const back = await RelayOwner.register()
    expect((await back.sync()).status).toBe(200)
    await back.send('inbox/delete')
  })
})

describe('fractional ts', () => {
  it('accepts the fractional ms a calibrated app clock stamps', async () => {
    const key = await SigningKey.generate()
    const inboxId = randomId()
    const ts = () => Date.now() + 0.4567
    const register = await buddies(
      'inbox/register',
      await envelope('inbox/register', { ts: ts(), nonce: randomId(), inboxId, ownerPub: key.publicKey }, key)
    )
    expect(register.body).toEqual({ ok: true })
    const sync = await buddies(
      'inbox/sync',
      await envelope('inbox/sync', { ts: ts(), nonce: randomId(), inboxId, since: 0 }, key)
    )
    expect(sync.status).toBe(200)
  })
})
