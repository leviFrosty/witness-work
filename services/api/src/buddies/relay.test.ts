import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BETA_BUNDLE_ID,
  DAY_MS,
  FCM_SEND_URL,
  Owner,
  fcmToken,
  hexToken,
  SigningKey,
  b64u,
  blobOfSize,
  createHarness,
  envelope,
  inviteSecrets,
  randomId,
  unsignedEnvelope,
  relayError,
  type Harness,
} from '../test/buddies'
import { BUDDIES_LIMITS } from './contracts'

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

const START = Date.UTC(2026, 8, 23, 12)
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  h = await createHarness()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Creates an invite from `owner`; returns its secrets. */
const createInvite = async (
  owner: Owner,
  expiresAt = Date.now() + 7 * DAY_MS
) => {
  const secrets = await inviteSecrets()
  const response = await owner.send('invite/create', {
    inviteId: secrets.inviteId,
    claimVerifier: secrets.claimVerifier,
    blob: blobOfSize(200),
    expiresAt,
  })
  return { ...secrets, response }
}

const claim = (inviteId: string, claimSecret: string, blob = blobOfSize(180)) =>
  h.post('/invite/claim', unsignedEnvelope({ inviteId, claimSecret, blob }))

const fetchInvite = (inviteId: string) =>
  h.post('/invite/fetch', unsignedEnvelope({ inviteId }))

describe('signed envelopes', () => {
  it('registers idempotently for the same key and conflicts on a different one', async () => {
    const owner = await Owner.create(h)
    expect(
      (await owner.send('inbox/register', { ownerPub: owner.key.publicKey }))
        .body
    ).toEqual({
      ok: true,
    })

    const intruder = await SigningKey.generate()
    const response = await h.send('inbox/register', intruder, {
      inboxId: owner.inboxId,
      ownerPub: intruder.publicKey,
    })
    expect(response).toEqual({ status: 409, body: relayError('conflict') })
  })

  it('requires register to be signed by the key it registers', async () => {
    const claimed = await SigningKey.generate()
    const signer = await SigningKey.generate()
    const response = await h.send('inbox/register', signer, {
      inboxId: randomId(),
      ownerPub: claimed.publicKey,
    })
    expect(response).toEqual({ status: 401, body: relayError('bad_signature') })
  })

  it('rejects owner ops signed with the wrong key', async () => {
    const owner = await Owner.create(h)
    const stranger = await SigningKey.generate()
    const response = await h.send('inbox/sync', stranger, {
      inboxId: owner.inboxId,
      since: 0,
    })
    expect(response).toEqual({ status: 401, body: relayError('bad_signature') })
  })

  it('rejects tampered payload bytes and a missing signature', async () => {
    const owner = await Owner.create(h)
    const signed = await envelope(
      'inbox/sync',
      { inboxId: owner.inboxId, since: 0, ts: Date.now(), nonce: randomId() },
      owner.key
    )
    const tampered = await envelope(
      'inbox/sync',
      { inboxId: owner.inboxId, since: 1, ts: Date.now(), nonce: randomId() },
      owner.key
    )
    // Valid payload bytes from one request, signature from another.
    expect(
      await h.post('/inbox/sync', {
        payload: tampered.payload,
        signature: signed.signature,
      })
    ).toEqual({
      status: 401,
      body: relayError('bad_signature'),
    })
    expect(await h.post('/inbox/sync', { payload: signed.payload })).toEqual({
      status: 401,
      body: relayError('bad_signature'),
    })
    expect((await h.post('/inbox/sync', signed)).status).toBe(200)
  })

  it('still accepts the short envelope names older builds send', async () => {
    const owner = await Owner.create(h)
    const signed = await envelope(
      'inbox/sync',
      { inboxId: owner.inboxId, since: 0, ts: Date.now(), nonce: randomId() },
      owner.key
    )
    expect(
      (await h.post('/inbox/sync', { p: signed.payload, s: signed.signature }))
        .status
    ).toBe(200)
  })

  it('binds the signature to the op in the path', async () => {
    const owner = await Owner.create(h)
    const signedForSync = await envelope(
      'inbox/sync',
      { inboxId: owner.inboxId, since: 0, ts: Date.now(), nonce: randomId() },
      owner.key
    )
    expect(await h.post('/inbox/delete', signedForSync)).toEqual({
      status: 401,
      body: relayError('bad_signature'),
    })
    expect((await owner.sync()).status).toBe(200)
  })

  it('verifies the exact signed bytes, not a re-serialization', async () => {
    const owner = await Owner.create(h)
    const raw = `{ "since" : 0,\n  "nonce":"${randomId()}", "ts":${Date.now()}, "inboxId": "${owner.inboxId}", "attest": null }`
    const response = await h.post(
      '/inbox/sync',
      await envelope('inbox/sync', raw, owner.key)
    )
    expect(response.status).toBe(200)
  })

  it('rejects stale timestamps on either side of the ±5 minute window', async () => {
    const owner = await Owner.create(h)
    for (const skew of [-300_001, 300_001]) {
      const response = await owner.send('inbox/sync', {
        since: 0,
        ts: Date.now() + skew,
      })
      expect(response).toEqual({ status: 401, body: relayError('stale') })
    }
    for (const skew of [-300_000, 300_000]) {
      expect(
        (await owner.send('inbox/sync', { since: 0, ts: Date.now() + skew }))
          .status
      ).toBe(200)
    }
  })

  it('tells a stale client the server time, in the body and a Date header', async () => {
    const owner = await Owner.create(h)
    advance(1_234)
    const request = await envelope(
      'inbox/sync',
      {
        inboxId: owner.inboxId,
        since: 0,
        ts: Date.now() - 10 * MINUTE_MS,
        nonce: randomId(),
      },
      owner.key
    )
    const response = await h.request('/inbox/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual(
      relayError('stale', { serverTime: START + 1_234 })
    )
    expect(response.headers.get('Date')).toBe(
      new Date(START + 1_234).toUTCString()
    )
  })

  it('rejects a replayed nonce for the same inbox', async () => {
    const owner = await Owner.create(h)
    const request = await envelope(
      'inbox/sync',
      { inboxId: owner.inboxId, since: 0, ts: Date.now(), nonce: randomId() },
      owner.key
    )
    expect((await h.post('/inbox/sync', request)).status).toBe(200)
    advance(4 * MINUTE_MS)
    expect(await h.post('/inbox/sync', request)).toEqual({
      status: 409,
      body: relayError('replay'),
    })
    // A reused nonce with a new signature is still a replay.
    const nonce = randomId()
    expect((await owner.send('inbox/sync', { since: 0, nonce })).status).toBe(
      200
    )
    expect(
      (await owner.send('roster/put', { blob: blobOfSize(10), nonce })).body
    ).toEqual(relayError('replay'))
  })

  it('returns not_found for an unknown inbox and bad_request for malformed input', async () => {
    const stranger = await SigningKey.generate()
    expect(
      await h.send('inbox/sync', stranger, { inboxId: randomId(), since: 0 })
    ).toEqual({ status: 404, body: relayError('not_found') })

    const owner = await Owner.create(h)
    expect(
      (await owner.send('inbox/sync', { since: -1 })).body
    ).toEqual(relayError('bad_request'))
    expect(
      (await h.post('/inbox/sync', 'not json')).body
    ).toEqual(relayError('bad_request'))
    expect(
      (await h.post('/inbox/sync', { p: '***' })).body
    ).toEqual(relayError('bad_request'))
    expect(
      (await owner.send('inbox/sync', { since: 0, inboxId: 'short' })).status
    ).toBe(400)
  })
})

describe('inbox/sync', () => {
  it('returns items after `since`, the full slot list, and a null roster when unchanged', async () => {
    const owner = await Owner.create(h)
    expect((await owner.sync()).body).toEqual({
      ok: true,
      seq: 0,
      slots: [],
      cards: [],
      events: [],
      roster: null,
      capabilities: { photos: true },
    })

    const alice = await owner.addWriter()
    advance(1_000)
    const bob = await owner.addWriter()
    const roster = blobOfSize(300)
    expect((await owner.send('roster/put', { blob: roster })).body).toEqual({
      ok: true,
      seq: 1,
    })
    const card = blobOfSize(500)
    expect((await alice.putCard(card)).body).toEqual({ ok: true, seq: 2 })
    const eventId = randomId()
    const eventBlob = blobOfSize(80)
    expect(
      (await bob.putEvent({ eventId, kind: 'pair.confirmed', blob: eventBlob }))
        .body
    ).toEqual({ ok: true, seq: 3 })

    const full = (await owner.sync(0)).body
    expect(full).toEqual({
      ok: true,
      seq: 3,
      slots: [
        { slotId: alice.slotId, createdAt: START },
        { slotId: bob.slotId, createdAt: START + 1_000 },
      ],
      cards: [
        { slotId: alice.slotId, blob: card, seq: 2, updatedAt: START + 1_000 },
      ],
      events: [
        {
          eventId,
          slotId: bob.slotId,
          kind: 'pair.confirmed',
          blob: eventBlob,
          seq: 3,
          createdAt: START + 1_000,
        },
      ],
      roster: { blob: roster, seq: 1 },
      capabilities: { photos: true },
    })

    const partial = (await owner.sync(1)).body
    expect(partial.roster).toBeNull()
    expect(partial.cards.map((c: { seq: number }) => c.seq)).toEqual([2])
    expect(partial.events.map((e: { seq: number }) => e.seq)).toEqual([3])

    const caughtUp = (await owner.sync(3)).body
    expect(caughtUp).toMatchObject({
      seq: 3,
      cards: [],
      events: [],
      roster: null,
    })
    expect(caughtUp.slots).toHaveLength(2)
  })

  it('replaces a slot card and gives it the next seq', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    await buddy.putCard(blobOfSize(40))
    const latest = blobOfSize(41)
    expect((await buddy.putCard(latest)).body).toEqual({ ok: true, seq: 2 })

    const { cards } = (await owner.sync()).body
    expect(cards).toEqual([
      expect.objectContaining({ slotId: buddy.slotId, blob: latest, seq: 2 }),
    ])
  })

  it('stops at a size budget and returns the cursor it reached', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const storage = h.inboxes.storage(owner.inboxId)
    // 450 max-size (8 KiB) events: more than one 4 MiB sync budget holds.
    const blob = 'A'.repeat(Math.ceil((8 * 1024 * 4) / 3))
    for (let seq = 1; seq <= 450; seq++) {
      storage.query(
        `INSERT INTO event (event_id, slot_id, kind, blob, seq, created_at)
         VALUES (?, ?, 'plan.joined', ?, ?, ?)`,
        `event-${seq}`,
        buddy.slotId,
        blob,
        seq,
        Date.now()
      )
    }
    storage.query('UPDATE meta SET seq = 450')
    expect((await buddy.putCard()).body).toEqual({ ok: true, seq: 451 })

    const first = (await owner.sync()).body
    expect(first.events.length).toBeGreaterThan(300)
    expect(first.events.length).toBeLessThan(450)
    expect(first.seq).toBe(first.events.at(-1).seq)
    expect(first.cards).toEqual([])

    const rest = (await owner.sync(first.seq)).body
    expect(rest.seq).toBe(451)
    expect(first.events.length + rest.events.length).toBe(450)
    expect(rest.events[0].seq).toBe(first.seq + 1)
    expect(rest.cards).toHaveLength(1)
  })
})

describe('events and pushes', () => {
  it('dedupes on eventId: a repeat returns the original seq and never pushes', async () => {
    const owner = await Owner.create(h)
    await owner.registerDevice()
    const buddy = await owner.addWriter()
    const eventId = randomId()

    const first = await buddy.putEvent({
      eventId,
      kind: 'pair.confirmed',
      push: true,
    })
    advance(2 * MINUTE_MS)
    const repeat = await buddy.putEvent({
      eventId,
      kind: 'pair.confirmed',
      push: true,
    })
    await h.flush()

    expect(first.body).toEqual({ ok: true, seq: 1 })
    expect(repeat.body).toEqual({ ok: true, seq: 1 })
    expect(h.pushes).toHaveLength(1)
    expect((await owner.sync()).body.events).toHaveLength(1)
  })

  it('pushes each device its own template and skips devices without one', async () => {
    const owner = await Owner.create(h)
    const withTemplate = randomId()
    await owner.registerDevice(withTemplate, {
      'plan.joined': { title: 'Plans', body: 'Mom plans to come' },
    })
    await owner.registerDevice(randomId(), {
      'invite.claimed': { title: 'x', body: 'y' },
    })
    const buddy = await owner.addWriter()
    const eventId = randomId()
    const blob = blobOfSize(48)

    const put = await buddy.putEvent({
      kind: 'plan.joined',
      eventId,
      blob,
      push: true,
    })
    await h.flush()

    expect(h.pushes).toHaveLength(1)
    expect(h.pushes[0].body).toEqual({
      aps: {
        alert: { title: 'Plans', body: 'Mom plans to come' },
        sound: 'default',
        'thread-id': 'buddies',
        'content-available': 1,
        'mutable-content': 1,
      },
      ww: { kind: 'plan.joined', seq: put.body.seq, eventId, blob },
    })
  })

  it('leaves out an event too big for the push, so the app fetches it by seq', async () => {
    const owner = await Owner.create(h)
    await owner.registerDevice(randomId(), {
      'plan.invite': { title: 'Plans', body: 'An invitation' },
    })
    await owner.registerFcmDevice(randomId(), {
      'plan.invite': { title: 'Plans', body: 'An invitation' },
    })
    const buddy = await owner.addWriter()
    const large = await buddy.putEvent({
      kind: 'plan.invite',
      blob: blobOfSize(4000),
      push: true,
    })
    await h.flush()

    const markers = h.pushes.map((push) => {
      const body = push.body as {
        ww?: unknown
        message?: { data: { body: string } }
      }
      return body.ww ?? JSON.parse(body.message!.data.body).ww
    })
    expect(markers).toEqual([
      { kind: 'plan.invite', seq: large.body.seq },
      { kind: 'plan.invite', seq: large.body.seq },
    ])
    for (const push of h.pushes) {
      expect(
        new TextEncoder().encode(JSON.stringify(push.body)).length
      ).toBeLessThanOrEqual(4096)
    }
  })

  it('pushes Android devices through FCM and iPhones through APNs', async () => {
    const owner = await Owner.create(h)
    const pixel = fcmToken()
    expect(
      (
        await owner.registerFcmDevice(
          randomId(),
          { 'plan.invite': { title: 'Plans', body: 'An invitation' } },
          pixel,
          true
        )
      ).body
    ).toEqual({ ok: true })
    await owner.registerDevice(randomId(), {
      'plan.invite': { title: 'Plans', body: 'An invitation' },
    })
    const buddy = await owner.addWriter()
    const eventId = randomId()
    const blob = blobOfSize(48)

    const put = await buddy.putEvent({
      kind: 'plan.invite',
      eventId,
      blob,
      push: true,
    })
    await h.flush()

    expect(h.pushes).toHaveLength(2)
    const fcm = h.pushes.find((push) => push.url === FCM_SEND_URL)
    expect(fcm?.body).toEqual({
      message: {
        token: pixel,
        // No title or message: the app posts the alert itself.
        data: {
          fallbackTitle: 'Plans',
          fallbackBody: 'An invitation',
          body: JSON.stringify({
            ww: { kind: 'plan.invite', seq: put.body.seq, eventId, blob },
          }),
        },
        android: { priority: 'HIGH', ttl: '86400s' },
      },
    })
    expect(
      h.pushes.filter((push) => push.url.includes('push.apple.com'))
    ).toHaveLength(1)
  })

  it('sends the alert expo-notifications shows to Android builds before named alerts', async () => {
    const owner = await Owner.create(h)
    const legacy = fcmToken()
    const named = fcmToken()
    const templates = {
      'plan.invite': { title: 'Plans', body: 'An invitation' },
    }
    await owner.registerFcmDevice(randomId(), templates, legacy)
    await owner.registerFcmDevice(randomId(), templates, named, true)
    const buddy = await owner.addWriter()

    await buddy.putEvent({ kind: 'plan.invite', push: true })
    await h.flush()

    const data = (token: string) => {
      const push = h.pushes.find(
        (p) =>
          (p.body as { message: { token: string } }).message.token === token
      )
      return (push!.body as { message: { data: Record<string, string> } })
        .message.data
    }
    expect(Object.keys(data(legacy)).sort()).toEqual(
      ['body', 'channelId', 'message', 'title'].sort()
    )
    expect(data(legacy)).toMatchObject({
      title: 'Plans',
      message: 'An invitation',
    })
    expect(Object.keys(data(named)).sort()).toEqual(
      ['body', 'fallbackBody', 'fallbackTitle'].sort()
    )
    expect(
      (
        await owner.send('device/register', {
          deviceId: randomId(),
          pushService: 'fcm',
          fcmToken: fcmToken(),
          appAlerts: 'yes',
          templates,
        })
      ).status
    ).toBe(400)
  })

  it('adds the app alerts column to inboxes from before named alerts', async () => {
    const owner = await Owner.create(h)
    const storage = h.inboxes.storage(owner.inboxId)
    const sql = storage.state.storage.sql
    const token = fcmToken()
    // An inbox as builds before named alerts left it.
    sql.exec('DROP TABLE push_device')
    sql.exec(
      `CREATE TABLE push_device (
         device_id        TEXT PRIMARY KEY,
         service          TEXT NOT NULL,
         token            TEXT NOT NULL,
         apns_environment TEXT,
         apns_topic       TEXT,
         templates        TEXT NOT NULL,
         created_at       INTEGER NOT NULL,
         updated_at       INTEGER NOT NULL
       )`
    )
    sql.exec(
      'INSERT INTO push_device VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)',
      randomId(),
      'fcm',
      token,
      JSON.stringify({ 'pair.confirmed': { title: 'T', body: 'B' } }),
      START,
      START
    )
    h.inboxes.restart(owner.inboxId)

    const buddy = await owner.addWriter()
    await buddy.putEvent({ kind: 'pair.confirmed', push: true })
    await h.flush()

    expect(h.pushes).toHaveLength(1)
    expect(
      (h.pushes[0].body as { message: { data: Record<string, string> } })
        .message.data
    ).toMatchObject({ title: 'T', message: 'B' })
    expect(
      storage.query('SELECT app_alerts AS appAlerts FROM push_device')
    ).toEqual([{ appAlerts: 0 }])
  })

  it('drops an Android device FCM reports as unregistered', async () => {
    const owner = await Owner.create(h)
    const stale = fcmToken()
    await owner.registerFcmDevice(randomId(), undefined, stale)
    await owner.registerFcmDevice()
    h.fcmResponse = (push) =>
      (push.body as { message: { token: string } }).message.token === stale
        ? Response.json(
            { error: { details: [{ errorCode: 'UNREGISTERED' }] } },
            { status: 404 }
          )
        : Response.json({ name: 'projects/p/messages/1' })
    const buddy = await owner.addWriter()

    await buddy.putEvent({ kind: 'pair.confirmed', push: true })
    await h.flush()

    const rows = h.inboxes
      .storage(owner.inboxId)
      .query('SELECT service, token FROM push_device')
    expect(rows).toHaveLength(1)
    expect(rows[0].service).toBe('fcm')
    expect(rows[0].token).not.toBe(stale)
  })

  it('sends each iPhone with its registered APNs topic, refusing ones this worker can’t sign for', async () => {
    const owner = await Owner.create(h)
    const beta = hexToken(32)
    expect(
      (
        await owner.registerDevice(randomId(), undefined, beta, 'production', {
          apnsTopic: BETA_BUNDLE_ID,
        })
      ).body
    ).toEqual({ ok: true })
    const plain = hexToken(32)
    await owner.registerDevice(randomId(), undefined, plain)
    expect(
      await owner.registerDevice(
        randomId(),
        undefined,
        hexToken(32),
        'sandbox',
        {
          apnsTopic: 'com.example.other',
        }
      )
    ).toEqual({ status: 400, body: relayError('bad_request') })
    const buddy = await owner.addWriter()

    await buddy.putEvent({ kind: 'pair.confirmed', push: true })
    await h.flush()

    const topics = Object.fromEntries(
      h.pushes.map((push) => [
        push.url.split('/').pop(),
        push.headers['apns-topic'],
      ])
    )
    expect(topics).toEqual({
      [beta]: BETA_BUNDLE_ID,
      [plain]: 'com.leviwilkerson.jwtimedev',
    })
  })

  it('moves devices registered before FCM into the new table, keeping them pushable', async () => {
    const owner = await Owner.create(h)
    const storage = h.inboxes.storage(owner.inboxId)
    const sql = storage.state.storage.sql
    const legacyToken = hexToken(32)
    // An inbox as builds before FCM left it.
    sql.exec('DROP TABLE push_device')
    sql.exec(
      `CREATE TABLE device (
         device_id        TEXT PRIMARY KEY,
         apns_token       TEXT NOT NULL,
         apns_environment TEXT NOT NULL,
         templates        TEXT NOT NULL,
         created_at       INTEGER NOT NULL,
         updated_at       INTEGER NOT NULL
       )`
    )
    const legacyId = randomId()
    sql.exec(
      'INSERT INTO device VALUES (?, ?, ?, ?, ?, ?)',
      legacyId,
      legacyToken,
      'production',
      JSON.stringify({ 'pair.confirmed': { title: 'T', body: 'B' } }),
      START,
      START
    )
    h.inboxes.restart(owner.inboxId)

    const buddy = await owner.addWriter()
    await buddy.putEvent({ kind: 'pair.confirmed', push: true })
    await h.flush()

    expect(h.pushes.map((push) => push.url)).toEqual([
      `https://api.push.apple.com/3/device/${legacyToken}`,
    ])
    expect(storage.tables()).not.toContain('device')
    expect(
      storage.query(
        'SELECT device_id AS id, service, apns_environment AS env, apns_topic AS topic FROM push_device'
      )
    ).toEqual([{ id: legacyId, service: 'apns', env: 'production', topic: null }])
  })

  it('stores but does not push events with push: false', async () => {
    const owner = await Owner.create(h)
    await owner.registerDevice()
    const buddy = await owner.addWriter()
    await buddy.putEvent({ push: false })
    await h.flush()
    expect(h.pushes).toHaveLength(0)
    expect((await owner.sync()).body.events).toHaveLength(1)
  })
})

describe('ending a connection', () => {
  it('slot/leave removes the slot, card, and events; later writes are gone', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const other = await owner.addWriter()
    await buddy.putCard()
    await buddy.putEvent()
    await other.putCard()

    expect((await buddy.send('slot/leave')).body).toEqual({ ok: true })
    expect((await buddy.send('slot/leave')).body).toEqual({ ok: true })

    expect(await buddy.putCard()).toEqual({
      status: 410,
      body: relayError('gone'),
    })
    expect(await buddy.putEvent()).toEqual({
      status: 410,
      body: relayError('gone'),
    })
    const sync = (await owner.sync()).body
    expect(sync.slots.map((s: { slotId: string }) => s.slotId)).toEqual([
      other.slotId,
    ])
    expect(sync.cards.map((c: { slotId: string }) => c.slotId)).toEqual([
      other.slotId,
    ])
    expect(sync.events).toEqual([])
  })

  it('slot/remove by the owner makes the buddy see gone', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    await buddy.putCard()
    expect(
      (await owner.send('slot/remove', { slotId: buddy.slotId })).body
    ).toEqual({ ok: true })
    expect(
      (await owner.send('slot/remove', { slotId: buddy.slotId })).body
    ).toEqual({ ok: true })
    expect(await buddy.putCard()).toEqual({
      status: 410,
      body: relayError('gone'),
    })
    expect((await owner.sync()).body).toMatchObject({ slots: [], cards: [] })
  })

  it('slot/leave into a deleted inbox is a no-op success', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    await owner.send('inbox/delete')
    expect((await buddy.send('slot/leave')).body).toEqual({ ok: true })
  })

  it('rejects slot/leave signed by anyone but the slot writer', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const impostor = await SigningKey.generate()
    const response = await h.send('slot/leave', impostor, {
      inboxId: owner.inboxId,
      slotId: buddy.slotId,
    })
    expect(response).toEqual({ status: 401, body: relayError('bad_signature') })
    expect((await owner.sync()).body.slots).toHaveLength(1)
  })

  it('slot/add is idempotent for the same key and conflicts on a different one', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    expect(
      (
        await owner.send('slot/add', {
          slotId: buddy.slotId,
          writerPub: buddy.key.publicKey,
        })
      ).body
    ).toEqual({ ok: true })
    const other = await SigningKey.generate()
    expect(
      (
        await owner.send('slot/add', {
          slotId: buddy.slotId,
          writerPub: other.publicKey,
        })
      ).body
    ).toEqual(relayError('conflict'))
  })
})

describe('caps and rate limits', () => {
  it('limits slots + open invites to 50', async () => {
    expect(BUDDIES_LIMITS.slotsPlusOpenInvites).toBe(50)
    const owner = await Owner.create(h)
    for (let i = 0; i < BUDDIES_LIMITS.slotsPlusOpenInvites - 2; i++)
      await owner.addWriter()
    expect((await createInvite(owner)).response.body).toEqual({ ok: true })
    expect((await createInvite(owner)).response.body).toEqual({ ok: true })

    expect((await createInvite(owner)).response).toEqual({
      status: 429,
      body: relayError('limit'),
    })
    const writer = await SigningKey.generate()
    expect(
      (
        await owner.send('slot/add', {
          slotId: randomId(),
          writerPub: writer.publicKey,
        })
      ).body
    ).toEqual(relayError('limit'))
  })

  it('takes an invite for every spot at once, as a key change’s reconnects need', async () => {
    expect(BUDDIES_LIMITS.openInvites).toBe(BUDDIES_LIMITS.slotsPlusOpenInvites)
    const owner = await Owner.create(h)
    for (let i = 0; i < BUDDIES_LIMITS.openInvites; i++) {
      expect((await createInvite(owner)).response.status).toBe(200)
    }
    expect(
      (await createInvite(owner)).response.body
    ).toEqual(relayError('limit'))
  })

  it('limits invite creation to 100 per 24 hours, counting deleted invites', async () => {
    expect(BUDDIES_LIMITS.inviteCreations).toBe(100)
    const owner = await Owner.create(h)
    for (let i = 0; i < BUDDIES_LIMITS.inviteCreations; i++) {
      const invite = await createInvite(owner)
      expect(invite.response.status).toBe(200)
      await owner.send('invite/delete', { inviteId: invite.inviteId })
      advance((20 * HOUR_MS) / BUDDIES_LIMITS.inviteCreations)
    }
    // The oldest of the 100 leaves the rolling day in 4 hours.
    expect((await createInvite(owner)).response).toEqual({
      status: 429,
      body: relayError('rate_limited', { retryAfter: 4 * 60 * 60 }),
    })
    advance(5 * HOUR_MS)
    expect((await createInvite(owner)).response.status).toBe(200)
  })

  it('limits writes to 60 per slot per hour, per slot', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const other = await owner.addWriter()
    for (let i = 0; i < 30; i++) {
      expect((await buddy.putCard()).status).toBe(200)
      expect((await buddy.putEvent()).status).toBe(200)
    }
    expect(await buddy.putCard()).toEqual({
      status: 429,
      body: relayError('rate_limited', { retryAfter: 60 * 60 }),
    })
    advance(15 * MINUTE_MS)
    expect(await buddy.putEvent()).toEqual({
      status: 429,
      body: relayError('rate_limited', { retryAfter: 45 * 60 }),
    })
    expect((await other.putCard()).status).toBe(200)

    advance(45 * MINUTE_MS)
    expect((await buddy.putCard()).status).toBe(200)
  })

  it('pushes at most 10 per slot per day, at least 60 s apart, and still stores the rest', async () => {
    const owner = await Owner.create(h)
    await owner.registerDevice()
    const buddy = await owner.addWriter()
    const other = await owner.addWriter()

    await buddy.putEvent({ push: true })
    advance(59_000)
    await buddy.putEvent({ push: true })
    await other.putEvent({ push: true })
    await h.flush()
    expect(h.pushes).toHaveLength(2)

    for (let i = 0; i < 12; i++) {
      advance(MINUTE_MS)
      await buddy.putEvent({ push: true })
    }
    await h.flush()
    // buddy: 10 pushes in the window; other: 1.
    expect(h.pushes).toHaveLength(11)
    expect((await owner.sync()).body.events).toHaveLength(15)

    advance(DAY_MS)
    await buddy.putEvent({ push: true })
    await h.flush()
    expect(h.pushes).toHaveLength(12)
  })

  it('lets invitations and answers skip the 60 s spacing, but not updates or cancels', async () => {
    const immediate = [
      'pair.confirmed',
      'share.reply',
      'plan.invite',
      'followup.invite',
      'car.invite',
      'join.request.a1b2c3d4e5f6',
    ]
    const spaced = [
      'plan.update',
      'plan.cancel',
      'followup.update',
      'followup.cancel',
      'join.cancel',
      'car.reply',
      'car.cancel',
    ]
    const owner = await Owner.create(h)
    await owner.registerDevice(
      randomId(),
      Object.fromEntries(
        [...immediate, ...spaced].map((kind) => [
          kind,
          { title: 't', body: kind },
        ])
      )
    )
    const buddy = await owner.addWriter()
    const kinds = () =>
      h.pushes.map((push) => (push.body as { ww: { kind: string } }).ww.kind)

    await buddy.putEvent({ kind: 'plan.update', push: true })
    for (const kind of immediate) {
      advance(1_000)
      await buddy.putEvent({ kind, push: true })
    }
    for (const kind of spaced) {
      advance(1_000)
      await buddy.putEvent({ kind, push: true })
    }
    await h.flush()
    expect(kinds()).toEqual(['plan.update', ...immediate])

    // The spacing runs from the last alert, immediate or not.
    advance(MINUTE_MS - spaced.length * 1_000)
    await buddy.putEvent({ kind: 'plan.cancel', push: true })
    advance(5_000)
    await buddy.putEvent({ kind: 'plan.cancel', push: true })
    await h.flush()
    expect(kinds()).toEqual(['plan.update', ...immediate, 'plan.cancel'])
    expect((await owner.sync()).body.events).toHaveLength(16)
  })

  it('still caps immediate kinds at 10 alerts per slot per day', async () => {
    const owner = await Owner.create(h)
    await owner.registerDevice(randomId(), {
      'share.reply': { title: 'Plans', body: 'A buddy answered' },
    })
    const buddy = await owner.addWriter()

    for (let i = 0; i < 12; i++) {
      advance(1_000)
      await buddy.putEvent({ kind: 'share.reply', push: true })
    }
    await h.flush()
    expect(h.pushes).toHaveLength(10)
    expect((await owner.sync()).body.events).toHaveLength(12)

    advance(DAY_MS)
    await buddy.putEvent({ kind: 'share.reply', push: true })
    await h.flush()
    expect(h.pushes).toHaveLength(11)
  })

  it('alerts car.invite at once on its template, under the daily cap, and car.reply on its own', async () => {
    const owner = await Owner.create(h)
    await owner.registerDevice(randomId(), {
      'car.invite': { title: 'Mileage', body: 'Someone shared a car' },
      'car.reply': { title: 'Mileage', body: 'Someone joined a car' },
    })
    const buddy = await owner.addWriter()
    const alerts = () =>
      h.pushes.map(
        (push) => (push.body as { aps: { alert: { body: string } } }).aps.alert.body
      )

    await buddy.putEvent({ kind: 'car.reply', push: true })
    // Invites 1 s apart all alert, until the slot's 10 a day.
    for (let i = 0; i < 11; i++) {
      advance(1_000)
      await buddy.putEvent({ kind: 'car.invite', push: true })
    }
    await h.flush()
    expect(alerts()).toEqual([
      'Someone joined a car',
      ...Array<string>(9).fill('Someone shared a car'),
    ])
    expect((await owner.sync()).body.events).toHaveLength(12)

    advance(DAY_MS)
    await buddy.putEvent({ kind: 'car.invite', push: true })
    await h.flush()
    expect(h.pushes).toHaveLength(11)
  })

  it('keeps 10 devices per inbox, evicting the least recently registered', async () => {
    const owner = await Owner.create(h)
    const ids = Array.from({ length: 11 }, () => randomId())
    for (const id of ids) {
      expect((await owner.registerDevice(id)).body).toEqual({ ok: true })
      advance(1_000)
    }
    const devices = h.inboxes
      .storage(owner.inboxId)
      .query('SELECT device_id AS id FROM push_device ORDER BY updated_at')
      .map((row) => row.id)
    expect(devices).toEqual(ids.slice(1))

    // Re-registering refreshes a device so it's no longer the oldest.
    await owner.registerDevice(ids[1])
    await owner.registerDevice(randomId())
    const after = h.inboxes
      .storage(owner.inboxId)
      .query('SELECT device_id AS id FROM push_device')
      .map((row) => row.id)
    expect(after).toHaveLength(10)
    expect(after).toContain(ids[1])
    expect(after).not.toContain(ids[2])
  })

  it('keeps one device per APNs token and deletes on device/unregister', async () => {
    const owner = await Owner.create(h)
    await owner.registerDevice(randomId(), undefined, 'ab'.repeat(32))
    const reinstalled = randomId()
    await owner.registerDevice(reinstalled, undefined, 'ab'.repeat(32))
    const storage = h.inboxes.storage(owner.inboxId)
    expect(storage.query('SELECT device_id AS id FROM push_device')).toEqual([
      { id: reinstalled },
    ])

    expect(
      (await owner.send('device/unregister', { deviceId: reinstalled })).body
    ).toEqual({
      ok: true,
    })
    expect(
      (await owner.send('device/unregister', { deviceId: reinstalled })).body
    ).toEqual({
      ok: true,
    })
    expect(storage.query('SELECT device_id FROM push_device')).toEqual([])
  })

  it('rate-limits unsigned ops by client IP', async () => {
    h = await createHarness({ unsignedLimit: 2 })
    const inviteId = randomId()
    expect((await fetchInvite(inviteId)).status).toBe(404)
    expect((await fetchInvite(inviteId)).status).toBe(404)
    expect(await fetchInvite(inviteId)).toEqual({
      status: 429,
      body: relayError('rate_limited'),
    })
    expect(
      (
        await h.post('/invite/fetch', unsignedEnvelope({ inviteId }), {
          'cf-connecting-ip': '198.51.100.2',
        })
      ).status
    ).toBe(404)
    expect(new Set(h.rateLimitKeys)).toEqual(
      new Set(['203.0.113.7', '198.51.100.2'])
    )
  })
})

describe('invites', () => {
  it('runs create → fetch → claim → confirm-delete, with the first claim winning', async () => {
    const owner = await Owner.create(h)
    await owner.registerDevice()
    const invite = await createInvite(owner)
    expect(invite.response.body).toEqual({ ok: true })

    const fetched = await fetchInvite(invite.inviteId)
    expect(fetched.body).toEqual({
      ok: true,
      blob: expect.any(String),
      expiresAt: START + 7 * DAY_MS,
      status: 'open',
    })

    const claimBlob = blobOfSize(150)
    expect(await claim(invite.inviteId, invite.claimSecret, claimBlob)).toEqual(
      {
        status: 200,
        body: { ok: true },
      }
    )
    await h.flush()
    expect(h.pushes).toHaveLength(1)
    expect(h.pushes[0].body).toMatchObject({ ww: { kind: 'invite.claimed' } })

    expect((await fetchInvite(invite.inviteId)).body.status).toBe('claimed')
    expect(await claim(invite.inviteId, invite.claimSecret)).toEqual({
      status: 409,
      body: relayError('conflict'),
    })

    const { events, seq } = (await owner.sync()).body
    expect(events).toEqual([
      {
        eventId: invite.inviteId,
        slotId: '',
        kind: 'invite.claimed',
        blob: claimBlob,
        seq: 1,
        createdAt: START,
      },
    ])
    expect(seq).toBe(1)

    expect(
      (await owner.send('invite/delete', { inviteId: invite.inviteId })).body
    ).toEqual({
      ok: true,
    })
    expect(await fetchInvite(invite.inviteId)).toEqual({
      status: 404,
      body: relayError('not_found'),
    })
    expect(h.invites.storage(invite.inviteId).tables()).toEqual([])
    expect(
      (await owner.send('invite/delete', { inviteId: invite.inviteId })).body
    ).toEqual({
      ok: true,
    })
  })

  it('burns the invite after 5 wrong claim secrets', async () => {
    const owner = await Owner.create(h)
    const invite = await createInvite(owner)
    const wrong = (await inviteSecrets()).claimSecret
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(await claim(invite.inviteId, wrong)).toEqual({
        status: 401,
        body: relayError('bad_signature'),
      })
    }
    expect((await fetchInvite(invite.inviteId)).status).toBe(404)
    expect(
      (await claim(invite.inviteId, invite.claimSecret)).body
    ).toEqual(relayError('not_found'))
    // The burned invite no longer holds one of the creator's spots.
    expect(
      h.inboxes.storage(owner.inboxId).query('SELECT invite_id FROM invite')
    ).toEqual([])
  })

  it('stops counting a claimed invite as open, so its confirm can add the last slot', async () => {
    const owner = await Owner.create(h)
    for (let i = 0; i < BUDDIES_LIMITS.slotsPlusOpenInvites - 1; i++)
      await owner.addWriter()
    const invite = await createInvite(owner)
    expect(invite.response.status).toBe(200)
    expect((await claim(invite.inviteId, invite.claimSecret)).status).toBe(200)
    await owner.addWriter()
    expect((await owner.sync()).body.slots).toHaveLength(
      BUDDIES_LIMITS.slotsPlusOpenInvites
    )
  })

  it('expires invites at expiresAt and deletes them after a short grace', async () => {
    const owner = await Owner.create(h)
    const invite = await createInvite(owner, Date.now() + HOUR_MS)
    const storage = h.invites.storage(invite.inviteId)
    expect(storage.alarm()).toBe(START + HOUR_MS + 10 * MINUTE_MS)

    advance(HOUR_MS)
    expect(
      (await fetchInvite(invite.inviteId)).body
    ).toEqual(relayError('not_found'))
    expect(
      (await claim(invite.inviteId, invite.claimSecret)).body
    ).toEqual(relayError('not_found'))

    advance(10 * MINUTE_MS)
    await h.invites.fireAlarm(invite.inviteId)
    expect(storage.tables()).toEqual([])

    // The creator's bookkeeping drops it too, freeing the spot.
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(
      h.inboxes.storage(owner.inboxId).query('SELECT invite_id FROM invite')
    ).toEqual([])
  })

  it('validates expiresAt against the 7 day + 5 minute ceiling', async () => {
    const owner = await Owner.create(h)
    const ceiling = Date.now() + 7 * DAY_MS + 5 * MINUTE_MS
    expect((await createInvite(owner, ceiling)).response.status).toBe(200)
    expect(
      (await createInvite(owner, ceiling + 1)).response.body
    ).toEqual(relayError('bad_request'))
    expect(
      (await createInvite(owner, Date.now())).response.body
    ).toEqual(relayError('bad_request'))
  })

  it('conflicts on an existing inviteId, and only the creator may delete', async () => {
    const owner = await Owner.create(h)
    const other = await Owner.create(h)
    const invite = await createInvite(owner)

    const duplicate = await other.send('invite/create', {
      inviteId: invite.inviteId,
      claimVerifier: invite.claimVerifier,
      blob: blobOfSize(10),
      expiresAt: Date.now() + DAY_MS,
    })
    expect(duplicate).toEqual({ status: 409, body: relayError('conflict') })
    // The failed create doesn't hold one of the other inbox's spots.
    expect(
      h.inboxes.storage(other.inboxId).query('SELECT * FROM invite')
    ).toEqual([])

    expect(
      (await other.send('invite/delete', { inviteId: invite.inviteId })).body
    ).toEqual({
      ok: true,
    })
    expect((await fetchInvite(invite.inviteId)).body.status).toBe('open')
  })

  it('treats a claim on a cancelled invite as not_found', async () => {
    const owner = await Owner.create(h)
    const invite = await createInvite(owner)
    // Simulate a lost invite DO delete: the inbox forgot it, the DO didn't.
    await h.inboxes.object(owner.inboxId).forgetInvite(invite.inviteId)
    expect(
      (await claim(invite.inviteId, invite.claimSecret)).body
    ).toEqual(relayError('not_found'))
    expect(h.invites.storage(invite.inviteId).tables()).toEqual([])
  })

  it('reopens an invite whose claim delivery failed and dedupes the retry', async () => {
    const owner = await Owner.create(h)
    await owner.registerDevice()
    const invite = await createInvite(owner)
    const blob = blobOfSize(120)

    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.inboxes.failNextReply(owner.inboxId)
    expect(await claim(invite.inviteId, invite.claimSecret, blob)).toEqual({
      status: 500,
      body: relayError('internal'),
    })
    expect((await fetchInvite(invite.inviteId)).body.status).toBe('open')

    // The retry lands on the already-stored event and pushes once.
    expect(
      (await claim(invite.inviteId, invite.claimSecret, blob)).body
    ).toEqual({ ok: true })
    await h.flush()
    expect(h.pushes).toHaveLength(1)
    const { events } = (await owner.sync()).body
    expect(events).toHaveLength(1)
    // A different claimer can't slip in behind the first claim.
    expect(
      (await claim(invite.inviteId, invite.claimSecret)).body
    ).toEqual(relayError('conflict'))
  })

  it('answers a retried claim from its winner with ok, without a second event or push', async () => {
    const owner = await Owner.create(h)
    await owner.registerDevice()
    const invite = await createInvite(owner)
    const blob = blobOfSize(150)
    expect((await claim(invite.inviteId, invite.claimSecret, blob)).body).toEqual(
      { ok: true }
    )
    await h.flush()

    // The response was lost; the client resends the same request.
    for (let retry = 0; retry < 2; retry++) {
      expect(await claim(invite.inviteId, invite.claimSecret, blob)).toEqual({
        status: 200,
        body: { ok: true },
      })
    }
    await h.flush()
    expect(h.pushes).toHaveLength(1)
    const { events } = (await owner.sync()).body
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'invite.claimed', blob })
    // The DO keeps a digest of the winning blob, never a second copy.
    expect(
      h.invites
        .storage(invite.inviteId)
        .query('SELECT claim_blob_hash AS hash FROM invite')[0].hash
    ).not.toBe(blob)
  })

  it('still refuses everyone but the winner of a claimed invite', async () => {
    const owner = await Owner.create(h)
    const invite = await createInvite(owner)
    const blob = blobOfSize(150)
    expect((await claim(invite.inviteId, invite.claimSecret, blob)).status).toBe(
      200
    )

    // The right secret with a freshly sealed blob is another claim.
    expect(await claim(invite.inviteId, invite.claimSecret)).toEqual({
      status: 409,
      body: relayError('conflict'),
    })
    // The winner's blob without the secret gets nowhere, and burns nothing.
    const wrong = (await inviteSecrets()).claimSecret
    for (let attempt = 0; attempt < 6; attempt++) {
      expect(await claim(invite.inviteId, wrong, blob)).toEqual({
        status: 409,
        body: relayError('conflict'),
      })
    }
    expect((await fetchInvite(invite.inviteId)).body.status).toBe('claimed')
    expect(
      (await claim(invite.inviteId, invite.claimSecret, blob)).body
    ).toEqual({ ok: true })
  })

  it('keeps conflict for retries on invites claimed before claims were repeatable', async () => {
    const owner = await Owner.create(h)
    const invite = await createInvite(owner)
    const blob = blobOfSize(150)
    await claim(invite.inviteId, invite.claimSecret, blob)
    // An invite DO from before this change: no column, so no digest.
    const storage = h.invites.storage(invite.inviteId)
    storage.query('ALTER TABLE invite DROP COLUMN claim_blob_hash')
    h.invites.restart(invite.inviteId)

    expect((await claim(invite.inviteId, invite.claimSecret, blob)).body).toEqual(
      relayError('conflict')
    )
    // It picked the column up in place and still serves the invite.
    expect(
      storage.query('PRAGMA table_info(invite)').map((column) => column.name)
    ).toContain('claim_blob_hash')
    expect((await fetchInvite(invite.inviteId)).body.status).toBe('claimed')
  })
})

describe('inbox/delete', () => {
  it('wipes the inbox and every invite it created', async () => {
    const owner = await Owner.create(h)
    await owner.registerDevice()
    const buddy = await owner.addWriter()
    await buddy.putCard()
    await buddy.putEvent()
    await owner.send('roster/put', { blob: blobOfSize(100) })
    const open = await createInvite(owner)
    const claimed = await createInvite(owner)
    await claim(claimed.inviteId, claimed.claimSecret)

    expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })

    // Only the owner key's hash is left (see "inbox ownership across wipes").
    expect(h.inboxes.storage(owner.inboxId).tables()).toEqual([
      'owner_tombstone',
    ])
    expect(h.inboxes.storage(owner.inboxId).alarm()).toBeNull()
    for (const invite of [open, claimed]) {
      expect((await fetchInvite(invite.inviteId)).status).toBe(404)
      expect(h.invites.storage(invite.inviteId).tables()).toEqual([])
    }
    expect((await owner.sync()).body).toEqual(relayError('not_found'))
    expect(await buddy.putCard()).toEqual({
      status: 404,
      body: relayError('not_found'),
    })

    // The same identity can start over from an empty inbox.
    expect(
      (await owner.send('inbox/register', { ownerPub: owner.key.publicKey }))
        .status
    ).toBe(200)
    expect((await owner.sync()).body).toMatchObject({ seq: 0, slots: [] })
  })

  it('retries invite deletions that fail during the wipe', async () => {
    const owner = await Owner.create(h)
    const invite = await createInvite(owner)
    h.invites.failNextReply(invite.inviteId)
    expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })
    // The delete ran even though its reply was lost; the retry is idempotent.
    const storage = h.inboxes.storage(owner.inboxId)
    expect(
      storage.query('SELECT invite_id AS id FROM pending_invite_delete')
    ).toEqual([{ id: invite.inviteId }])
    expect(storage.alarm()).toBe(START + MINUTE_MS)

    advance(MINUTE_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(storage.tables()).toEqual(['owner_tombstone'])
  })
})

describe('inbox ownership across wipes', () => {
  /** What a wiped inbox keeps: SHA-256 of the label and the canonical key. */
  const ownerKeyHash = async (ownerPub: string) =>
    b64u(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(`ww-buddies/v1/inbox-owner\n${ownerPub}`)
        )
      )
    )

  const registerAs = (key: SigningKey, inboxId: string) =>
    h.send('inbox/register', key, { inboxId, ownerPub: key.publicKey })

  const wipes = {
    'inbox/delete': async (owner: Owner) => {
      expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })
    },
    'the 180-day inactivity wipe': async (owner: Owner) => {
      advance(180 * DAY_MS)
      await h.inboxes.fireAlarm(owner.inboxId)
    },
  }

  for (const [name, wipe] of Object.entries(wipes)) {
    describe(`after ${name}`, () => {
      it('keeps only a hash of the owner key, with no alarm', async () => {
        const owner = await Owner.create(h)
        await owner.addWriter()
        const storage = h.inboxes.storage(owner.inboxId)
        expect(storage.tables()).not.toContain('owner_tombstone')

        await wipe(owner)

        expect(storage.tables()).toEqual(['owner_tombstone'])
        expect(storage.query('SELECT * FROM owner_tombstone')).toEqual([
          {
            singleton: 1,
            owner_key_hash: await ownerKeyHash(owner.key.publicKey),
          },
        ])
        expect(storage.alarm()).toBeNull()
      })

      it('lets only the same key register the inbox again', async () => {
        const owner = await Owner.create(h)
        const buddy = await owner.addWriter()
        await wipe(owner)
        const storage = h.inboxes.storage(owner.inboxId)

        const intruder = await SigningKey.generate()
        expect(await registerAs(intruder, owner.inboxId)).toEqual({
          status: 409,
          body: relayError('conflict'),
        })
        // A refused registration stores nothing.
        expect(storage.tables()).toEqual(['owner_tombstone'])

        // Everything else still sees no inbox, exactly as before the binding.
        expect((await owner.sync()).body).toEqual(relayError('not_found'))
        expect(await buddy.putCard()).toEqual({
          status: 404,
          body: relayError('not_found'),
        })
        expect((await buddy.send('slot/leave')).body).toEqual({ ok: true })

        expect(await registerAs(owner.key, owner.inboxId)).toEqual({
          status: 200,
          body: { ok: true },
        })
        expect((await owner.sync()).body).toMatchObject({ seq: 0, slots: [] })
        // Until the owner restores the slot, the buddy's writes are gone.
        expect(await buddy.putCard()).toEqual({
          status: 410,
          body: relayError('gone'),
        })
        expect(await registerAs(intruder, owner.inboxId)).toEqual({
          status: 409,
          body: relayError('conflict'),
        })

        await owner.send('slot/add', {
          slotId: buddy.slotId,
          writerPub: buddy.key.publicKey,
        })
        expect((await buddy.putCard()).status).toBe(200)
      })
    })
  }

  it('stays bound through a second wipe after the owner comes back', async () => {
    const owner = await Owner.create(h)
    await wipes['the 180-day inactivity wipe'](owner)
    expect((await registerAs(owner.key, owner.inboxId)).status).toBe(200)
    await wipes['inbox/delete'](owner)

    const intruder = await SigningKey.generate()
    expect((await registerAs(intruder, owner.inboxId)).status).toBe(409)
    expect((await registerAs(owner.key, owner.inboxId)).status).toBe(200)
  })

  it('stays bound after the alarm finishes failed invite cleanup', async () => {
    const owner = await Owner.create(h)
    const invite = await createInvite(owner)
    h.invites.failNextReply(invite.inviteId)
    await wipes['inbox/delete'](owner)
    const storage = h.inboxes.storage(owner.inboxId)
    expect(storage.tables()).toContain('pending_invite_delete')

    const intruder = await SigningKey.generate()
    expect((await registerAs(intruder, owner.inboxId)).status).toBe(409)

    advance(MINUTE_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(storage.tables()).toEqual(['owner_tombstone'])
    expect(storage.alarm()).toBeNull()
    expect((await registerAs(intruder, owner.inboxId)).status).toBe(409)
    expect((await registerAs(owner.key, owner.inboxId)).status).toBe(200)
  })

  it('does not wipe an inbox that became active while the alarm hashed its key', async () => {
    const owner = await Owner.create(h)
    advance(180 * DAY_MS)
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    let synced: Promise<unknown> | null = null
    const spy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (algorithm, data) => {
        // The owner syncs while the alarm awaits the tombstone hash.
        synced ??= owner.sync()
        await synced
        return digest(algorithm, data)
      })
    await h.inboxes.fireAlarm(owner.inboxId)
    spy.mockRestore()

    expect(await synced).toMatchObject({ status: 200 })
    const storage = h.inboxes.storage(owner.inboxId)
    expect(storage.tables()).toContain('meta')
    expect(storage.alarm()).toBe(Date.now() + 180 * DAY_MS)
    expect((await owner.sync()).status).toBe(200)
  })
})

describe('kill switch', () => {
  it('returns disabled for everything except inbox/delete, slot/remove, and slot/leave', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const leaver = await owner.addWriter()
    const invite = await createInvite(owner)

    await h.kv.put('buddies:enabled', 'false')
    const disabled = { status: 503, body: relayError('disabled') }
    expect(await owner.sync()).toEqual(disabled)
    expect(await owner.registerDevice()).toEqual(disabled)
    expect(await buddy.putCard()).toEqual(disabled)
    expect(await buddy.putEvent()).toEqual(disabled)
    expect(await createInvite(owner).then((i) => i.response)).toEqual(disabled)
    expect(await fetchInvite(invite.inviteId)).toEqual(disabled)
    expect(await claim(invite.inviteId, invite.claimSecret)).toEqual(disabled)
    expect(await h.post('/inbox/register', { p: 'x' })).toEqual(disabled)

    expect((await leaver.send('slot/leave')).body).toEqual({ ok: true })
    expect(
      (await owner.send('slot/remove', { slotId: buddy.slotId })).body
    ).toEqual({ ok: true })
    expect((await owner.send('inbox/delete')).body).toEqual({ ok: true })
    expect((await fetchInvite(invite.inviteId)).status).toBe(503)
    expect(h.invites.storage(invite.inviteId).tables()).toEqual([])
  })

  it('reads KV first and falls back to BUDDIES_ENABLED when the key is absent', async () => {
    const probe = async (harness: Harness) =>
      (
        await harness.post(
          '/invite/fetch',
          unsignedEnvelope({ inviteId: randomId() })
        )
      ).status

    expect(await probe(await createHarness({ enabled: 'false' }))).toBe(503)
    expect(await probe(await createHarness({ enabled: 'true' }))).toBe(404)
    expect(
      await probe(await createHarness({ enabled: 'false', kvEnabled: 'true' }))
    ).toBe(404)
    expect(
      await probe(await createHarness({ enabled: 'true', kvEnabled: 'false' }))
    ).toBe(503)
    expect(
      await probe(await createHarness({ enabled: 'true', kvEnabled: 'yes' }))
    ).toBe(503)
  })
})

describe('retention', () => {
  it('deletes events 30 days after creation via the alarm', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    await buddy.putEvent()
    advance(DAY_MS)
    await buddy.putEvent()
    const storage = h.inboxes.storage(owner.inboxId)
    expect(storage.alarm()).toBe(START + 30 * DAY_MS)

    advance(29 * DAY_MS)
    await owner.sync()
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(storage.query('SELECT COUNT(*) AS n FROM event')).toEqual([{ n: 1 }])
    expect(storage.alarm()).toBe(START + 31 * DAY_MS)

    advance(DAY_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(storage.query('SELECT COUNT(*) AS n FROM event')).toEqual([{ n: 0 }])
  })

  it('wipes an inbox 180 days after the last owner op, ignoring buddy writes', async () => {
    const owner = await Owner.create(h)
    const buddy = await owner.addWriter()
    const storage = h.inboxes.storage(owner.inboxId)
    expect(storage.alarm()).toBe(START + 180 * DAY_MS)

    advance(100 * DAY_MS)
    await owner.sync()
    advance(80 * DAY_MS)
    await buddy.putCard()
    await h.inboxes.fireAlarm(owner.inboxId)
    // Still active: the sync 80 days ago reset the clock.
    expect(storage.tables()).toContain('meta')
    expect(storage.alarm()).toBe(START + 280 * DAY_MS)

    advance(100 * DAY_MS)
    await h.inboxes.fireAlarm(owner.inboxId)
    expect(storage.tables()).toEqual(['owner_tombstone'])
    expect((await owner.sync()).body).toEqual(relayError('not_found'))
  })

  it('stores nothing for requests to an inbox that was never registered', async () => {
    const stranger = await SigningKey.generate()
    const inboxId = randomId()
    await h.send('inbox/sync', stranger, { inboxId, since: 0 })
    await h.send('card/put', stranger, {
      inboxId,
      slotId: randomId(),
      blob: blobOfSize(10),
    })
    await h.send('inbox/register', stranger, {
      inboxId,
      ownerPub: stranger.publicKey,
      ts: Date.now() - DAY_MS,
    })
    expect(h.inboxes.storage(inboxId).tables()).toEqual([])
  })
})
