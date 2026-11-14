import { describe, expect, it } from 'vitest'
import {
  BUDDIES_ERROR_STATUS,
  BUDDIES_LIMITS,
  BUDDIES_OPS,
  BUDDIES_PAYLOAD_PARSERS,
  buddyBlobKey,
  decodeSignature,
  isImmediatePushKind,
} from './contracts'
import { BUDDIES_ABUSE_LIMITS } from './limits'
import { bytesToBase64Url } from '../crypto'

const NOW = Date.UTC(2026, 8, 23)
const id = (fill = 'A') => fill.repeat(22)
const b64uOfBytes = (size: number) =>
  bytesToBase64Url(new Uint8Array(size).fill(7))
const signed = { ts: NOW, nonce: id('N'), inboxId: id('I') }

const parse = <K extends keyof typeof BUDDIES_PAYLOAD_PARSERS>(
  op: K,
  payload: Record<string, unknown>
) => BUDDIES_PAYLOAD_PARSERS[op](payload, NOW)

describe('ids, keys, and signatures', () => {
  it.each([
    ['22 url-safe chars', 'Ab0_-Ab0_-Ab0_-Ab0_-Ab', true],
    ['21 chars', 'A'.repeat(21), false],
    ['23 chars', 'A'.repeat(23), false],
    ['standard base64 chars', `${'A'.repeat(20)}+/`, false],
    ['padding', `${'A'.repeat(21)}=`, false],
  ])('validates an id with %s', (_, inboxId, valid) => {
    expect(parse('inbox/delete', { ...signed, inboxId }) !== null).toBe(valid)
  })

  it('requires a numeric ts and a 22-char nonce', () => {
    expect(parse('inbox/delete', { ...signed, ts: String(NOW) })).toBeNull()
    expect(parse('inbox/delete', { ...signed, ts: Number.NaN })).toBeNull()
    expect(parse('inbox/delete', { ...signed, ts: 2 ** 60 })).toBeNull()
    expect(parse('inbox/delete', { ...signed, nonce: 'short' })).toBeNull()
    expect(parse('inbox/delete', { ...signed, nonce: undefined })).toBeNull()
  })

  it('floors a fractional ts (calibrated app clocks send one)', () => {
    expect(parse('inbox/delete', { ...signed, ts: NOW + 0.5 })?.ts).toBe(NOW)
  })

  it('requires 32-byte keys and returns them canonically encoded', () => {
    const key = b64uOfBytes(32)
    expect(parse('inbox/register', { ...signed, ownerPub: key })).toEqual({
      ...signed,
      ownerPub: key,
    })
    expect(
      parse('inbox/register', { ...signed, ownerPub: b64uOfBytes(31) })
    ).toBeNull()
    expect(
      parse('inbox/register', { ...signed, ownerPub: b64uOfBytes(33) })
    ).toBeNull()
    // Unused trailing bits don't make a different key.
    const noncanonical = `${key.slice(0, 42)}${String.fromCharCode(key.charCodeAt(42) + 1)}`
    expect(
      parse('inbox/register', { ...signed, ownerPub: noncanonical })?.ownerPub
    ).toBe(key)
  })

  it('decodes only 64-byte signatures', () => {
    expect(decodeSignature(b64uOfBytes(64))).toHaveLength(64)
    expect(decodeSignature(b64uOfBytes(63))).toBeNull()
    expect(decodeSignature(undefined)).toBeNull()
  })

  it('drops unknown fields, including the reserved attest', () => {
    expect(
      parse('inbox/register', {
        ...signed,
        ownerPub: b64uOfBytes(32),
        attest: { x: 1 },
        extra: 1,
      })
    ).toEqual({ ...signed, ownerPub: b64uOfBytes(32) })
  })
})

describe('blob sizes (decoded bytes)', () => {
  it.each([
    ['roster/put', 128 * 1024, {}],
    ['card/put', 16 * 1024, { slotId: id('S') }],
    [
      'event/put',
      8 * 1024,
      { slotId: id('S'), eventId: id('E'), kind: 'pair.confirmed', push: true },
    ],
    [
      'invite/create',
      4 * 1024,
      { inviteId: id('V'), claimVerifier: b64uOfBytes(32), expiresAt: NOW + 1 },
    ],
  ] as const)('%s accepts up to %i bytes', (op, max, extra) => {
    expect(
      parse(op, { ...signed, ...extra, blob: b64uOfBytes(max) })
    ).not.toBeNull()
    expect(
      parse(op, { ...signed, ...extra, blob: b64uOfBytes(max + 1) })
    ).toBeNull()
    expect(parse(op, { ...signed, ...extra, blob: '' })).toBeNull()
    expect(parse(op, { ...signed, ...extra, blob: 'AAAAA' })).toBeNull()
  })

  it('invite/claim takes a 4 KiB blob and a 32-byte claim secret', () => {
    const claim = { inviteId: id('V'), claimSecret: b64uOfBytes(32) }
    expect(
      parse('invite/claim', { ...claim, blob: b64uOfBytes(4096) })
    ).toMatchObject({
      inviteId: id('V'),
      claimSecret: new Uint8Array(32).fill(7),
    })
    expect(
      parse('invite/claim', { ...claim, blob: b64uOfBytes(4097) })
    ).toBeNull()
    expect(
      parse('invite/claim', {
        ...claim,
        claimSecret: b64uOfBytes(31),
        blob: b64uOfBytes(1),
      })
    ).toBeNull()
  })
})

describe('event kinds and templates', () => {
  const event = {
    ...signed,
    slotId: id('S'),
    eventId: id('E'),
    blob: b64uOfBytes(4),
    push: false,
  }

  it.each([
    ['pair.confirmed', true],
    ['a'.repeat(40), true],
    ['a'.repeat(41), false],
    ['Pair.confirmed', false],
    ['1abc', false],
    ['pair_confirmed', false],
    ['', false],
  ])('kind %j valid=%s', (kind, valid) => {
    expect(parse('event/put', { ...event, kind }) !== null).toBe(valid)
  })

  it('requires push to be a boolean', () => {
    expect(parse('event/put', { ...event, kind: 'k', push: 'yes' })).toBeNull()
    expect(
      parse('event/put', { ...event, kind: 'k', push: undefined })
    ).toBeNull()
  })

  const device = {
    ...signed,
    deviceId: id('D'),
    apnsToken: 'AB'.repeat(32),
    apnsEnvironment: 'sandbox',
  }

  it('accepts templates up to 200 characters, counting code points', () => {
    const emoji = '\u{1F64C}'.repeat(200)
    const parsed = parse('device/register', {
      ...device,
      templates: {
        'invite.claimed': { title: emoji, body: 'b'.repeat(200), extra: 1 },
      },
    })
    expect(parsed).toMatchObject({
      push: {
        service: 'apns',
        token: 'ab'.repeat(32),
        apnsEnvironment: 'sandbox',
        apnsTopic: null,
      },
      templates: { 'invite.claimed': { title: emoji, body: 'b'.repeat(200) } },
    })
    expect(parsed?.templates['invite.claimed']).toEqual({
      title: emoji,
      body: 'b'.repeat(200),
    })
    expect(
      parse('device/register', {
        ...device,
        templates: { 'invite.claimed': { title: 't', body: 'b'.repeat(201) } },
      })
    ).toBeNull()
  })

  it('takes the car.invite and car.reply templates beside the app’s others, up to 32', () => {
    const template = { title: 't', body: 'b' }
    for (const others of [16, 30]) {
      const templates = {
        ...Object.fromEntries(
          Array.from({ length: others }, (_, i) => [`k${i}`, template])
        ),
        'car.invite': { title: 'Mileage', body: 'Anna shared a car with you' },
        'car.reply': { title: 'Mileage', body: 'Joe joined a shared car' },
      }
      const parsed = parse('device/register', { ...device, templates })
      expect(Object.keys(parsed?.templates ?? {})).toHaveLength(others + 2)
      expect(parsed?.templates['car.invite']).toEqual(templates['car.invite'])
      expect(parsed?.templates['car.reply']).toEqual(templates['car.reply'])
    }
  })

  it('rejects bad template keys, shapes, counts, tokens, and environments', () => {
    const template = { title: 't', body: 'b' }
    expect(
      parse('device/register', { ...device, templates: { Bad: template } })
    ).toBeNull()
    expect(
      parse('device/register', {
        ...device,
        templates: { k: { title: 1, body: 'b' } },
      })
    ).toBeNull()
    expect(parse('device/register', { ...device, templates: [] })).toBeNull()
    const many = Object.fromEntries(
      Array.from({ length: BUDDIES_LIMITS.templates + 1 }, (_, i) => [
        `k${i}`,
        template,
      ])
    )
    expect(parse('device/register', { ...device, templates: many })).toBeNull()
    expect(
      parse('device/register', { ...device, templates: {} })
    ).not.toBeNull()
    expect(
      parse('device/register', { ...device, templates: {}, apnsToken: 'xyz' })
    ).toBeNull()
    expect(
      parse('device/register', { ...device, templates: {}, apnsToken: 'abc' })
    ).toBeNull()
    expect(
      parse('device/register', {
        ...device,
        templates: {},
        apnsEnvironment: 'development',
      })
    ).toBeNull()
  })

  it('reads APNs topics, and FCM tokens for pushService "fcm"', () => {
    const fcmToken = `${id('F')}:APA91b${'x'.repeat(120)}`
    expect(
      parse('device/register', {
        ...device,
        templates: {},
        apnsTopic: 'com.leviwilkerson.jwtimebeta',
      })?.push
    ).toEqual({
      service: 'apns',
      token: 'ab'.repeat(32),
      apnsEnvironment: 'sandbox',
      apnsTopic: 'com.leviwilkerson.jwtimebeta',
    })
    expect(
      parse('device/register', { ...device, templates: {}, pushService: 'apns' })
        ?.push.service
    ).toBe('apns')
    for (const apnsTopic of ['', 'nodots', 'com.example/app', 7]) {
      expect(
        parse('device/register', { ...device, templates: {}, apnsTopic })
      ).toBeNull()
    }

    const android = {
      ...signed,
      deviceId: id('D'),
      pushService: 'fcm',
      fcmToken,
      templates: {},
    }
    expect(parse('device/register', android)?.push).toEqual({
      service: 'fcm',
      token: fcmToken,
      appAlerts: false,
    })
    // The other service's fields are ignored.
    expect(
      parse('device/register', { ...android, apnsToken: 'zz', apnsTopic: 1 })
        ?.push
    ).toEqual({ service: 'fcm', token: fcmToken, appAlerts: false })
    // Builds with named alerts post the alert themselves.
    expect(
      parse('device/register', { ...android, appAlerts: true })?.push
    ).toEqual({ service: 'fcm', token: fcmToken, appAlerts: true })
    expect(
      parse('device/register', { ...android, appAlerts: 'true' })
    ).toBeNull()
    for (const bad of [undefined, '', 'short', `${fcmToken} `, 'a/b'.repeat(20)]) {
      expect(
        parse('device/register', { ...android, fcmToken: bad })
      ).toBeNull()
    }
    expect(
      parse('device/register', { ...android, pushService: 'gcm' })
    ).toBeNull()
    // Absent means APNs; null isn't a service.
    expect(
      parse('device/register', { ...device, templates: {}, pushService: null })
    ).toBeNull()
    // An FCM token alone is still an APNs registration, missing its token.
    expect(
      parse('device/register', { ...android, pushService: undefined })
    ).toBeNull()
  })
})

describe('invite/create expiry and inbox/sync cursor', () => {
  const invite = {
    ...signed,
    inviteId: id('V'),
    claimVerifier: b64uOfBytes(32),
    blob: b64uOfBytes(10),
  }

  it('accepts expiresAt in (now, now + 7 days + 5 minutes]', () => {
    const ceiling = NOW + 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000
    expect(
      parse('invite/create', { ...invite, expiresAt: ceiling })
    ).not.toBeNull()
    expect(
      parse('invite/create', { ...invite, expiresAt: ceiling + 1 })
    ).toBeNull()
    expect(parse('invite/create', { ...invite, expiresAt: NOW })).toBeNull()
    expect(
      parse('invite/create', { ...invite, expiresAt: NOW + 1.5 })
    ).toBeNull()
  })

  it('requires since to be a non-negative integer', () => {
    expect(parse('inbox/sync', { ...signed, since: 0 })).toEqual({
      ...signed,
      since: 0,
    })
    expect(parse('inbox/sync', { ...signed, since: -1 })).toBeNull()
    expect(parse('inbox/sync', { ...signed, since: 1.5 })).toBeNull()
    expect(parse('inbox/sync', { ...signed })).toBeNull()
  })
})

describe('inbox/live', () => {
  it('takes only the inbox fields and is not a POST op', () => {
    expect(parse('inbox/live', { ...signed, since: 3 })).toEqual(signed)
    expect(parse('inbox/live', { ...signed, inboxId: 'x' })).toBeNull()
    expect(BUDDIES_OPS).not.toContain('inbox/live')
  })
})

describe('request ceiling', () => {
  const b64Chars = (bytes: number) => Math.ceil((bytes * 4) / 3)
  // The legacy form base64url-encodes the payload JSON a second time.
  const legacyBody = (payload: object) =>
    JSON.stringify({
      payload: 'A'.repeat(
        b64Chars(new TextEncoder().encode(JSON.stringify(payload)).length)
      ),
      signature: 'A'.repeat(86),
    }).length

  it('fits the largest roster and a full set of templates in one request', () => {
    const roster = { ...signed, blob: 'A'.repeat(b64Chars(BUDDIES_LIMITS.rosterBytes)) }
    expect(legacyBody(roster)).toBeLessThan(BUDDIES_LIMITS.requestBytes)

    // Four UTF-8 bytes per character is the most a template can take.
    const text = '😀'.repeat(BUDDIES_LIMITS.templateChars)
    const templates = Object.fromEntries(
      Array.from({ length: BUDDIES_LIMITS.templates }, (_, i) => [
        `join.request.${String(i).padStart(12, '0')}`,
        { title: text, body: text },
      ])
    )
    const register = { ...signed, deviceId: 'A'.repeat(22), templates }
    expect(legacyBody(register)).toBeLessThan(BUDDIES_LIMITS.requestBytes)
  })
})

describe('photo blobs', () => {
  const blobId = b64uOfBytes(32)
  const put = {
    ...signed,
    blobId,
    bytes: 1_024,
    expiresAt: NOW + 1,
    readTokenHash: b64uOfBytes(32),
  }
  const DAY = 24 * 60 * 60 * 1_000

  it('sizes blobs, lifetimes, deletes, and caps as the contract says', () => {
    expect(BUDDIES_LIMITS.blobBytes).toBe(1_048_576)
    expect(BUDDIES_LIMITS.maxBlobLifetimeMs).toBe(90 * DAY)
    expect(BUDDIES_LIMITS.blobDeleteIds).toBe(50)
    expect(BUDDIES_ABUSE_LIMITS).toMatchObject({
      inboxBlobs: 300,
      inboxBlobBytes: 150 * 1_048_576,
      blobUploads: 100,
      blobUploadWindowMs: DAY,
    })
    expect(BUDDIES_ABUSE_LIMITS.edge.blobPut.perMinute).toBe(60)
    expect(BUDDIES_ABUSE_LIMITS.edge.blobGet.perMinute).toBe(600)
    expect(BUDDIES_ERROR_STATUS.too_large).toBe(413)
    expect(BUDDIES_ERROR_STATUS.photos_disabled).toBe(503)
    expect(buddyBlobKey(id('I'), blobId)).toBe(`v1/${id('I')}/${blobId}`)
  })

  it('keeps blob/put and blob/get out of the JSON ops; blob/delete is one', () => {
    expect(BUDDIES_OPS).not.toContain('blob/put')
    expect(BUDDIES_OPS).not.toContain('blob/get')
    expect(BUDDIES_OPS).toContain('blob/delete')
  })

  it('blob/put takes canonical 32-byte hashes, bytes ≥ 1, and expiresAt in (now, now + 90 days]', () => {
    expect(parse('blob/put', put)).toEqual(put)
    // `bytes` past 1 MiB parses: the route answers `too_large` for it.
    expect(parse('blob/put', { ...put, bytes: 2 * 1_048_576 })).not.toBeNull()
    expect(
      parse('blob/put', { ...put, expiresAt: NOW + 90 * DAY })
    ).not.toBeNull()
    for (const bad of [
      { bytes: 0 },
      { bytes: -1 },
      { bytes: 1.5 },
      { expiresAt: NOW },
      { expiresAt: NOW + 90 * DAY + 1 },
      { blobId: b64uOfBytes(31) },
      { blobId: b64uOfBytes(33) },
      // 43 characters whose last one carries stray bits: not canonical.
      { blobId: `${blobId.slice(0, 42)}B` },
      { readTokenHash: undefined },
    ]) {
      expect(parse('blob/put', { ...put, ...bad }), JSON.stringify(bad)).toBeNull()
    }
  })

  it('blob/get decodes the token; blob/delete takes 1–50 ids, deduplicated', () => {
    const token = b64uOfBytes(32)
    expect(
      parse('blob/get', { inboxId: id('I'), blobId, token })
    ).toEqual({
      inboxId: id('I'),
      blobId,
      token: new Uint8Array(32).fill(7),
    })
    expect(parse('blob/get', { inboxId: id('I'), blobId })).toBeNull()
    expect(
      parse('blob/delete', { ...signed, blobIds: [blobId, blobId] })
    ).toEqual({ ...signed, blobIds: [blobId] })
    expect(parse('blob/delete', { ...signed, blobIds: [] })).toBeNull()
    expect(
      parse('blob/delete', {
        ...signed,
        blobIds: Array.from({ length: 51 }, (_, i) =>
          bytesToBase64Url(new Uint8Array(32).fill(i))
        ),
      })
    ).toBeNull()
  })
})

describe('immediate push kinds', () => {
  it.each([
    ['pair.confirmed', true],
    ['share.reply', true],
    ['plan.invite', true],
    ['followup.invite', true],
    ['car.invite', true],
    ['territory.invite', true],
    ['territory.handoff', true],
    ['territory.reply', false],
    ['territory.cancel', false],
    ['join.request.a1b2c3d4e5f6', true],
    ['invite.claimed', false],
    ['plan.update', false],
    ['plan.cancel', false],
    ['followup.update', false],
    ['followup.cancel', false],
    ['join.cancel', false],
    ['join.request', false],
    ['plan.joined', false],
    ['car.reply', false],
    ['car.cancel', false],
  ])('%s skips the push spacing: %s', (kind, immediate) => {
    expect(isImmediatePushKind(kind)).toBe(immediate)
  })
})
