import { describe, expect, it } from 'vitest'
import {
  b64u,
  randomBytes,
  randomId,
  sha256B64u,
  spaceMemberId,
} from '../test/buddiesClient'
import { makeMemoryKv } from '../test/memoryKv'
import { BUDDIES_ERROR_STATUS } from '../buddies/contracts'
import {
  SPACES_ERROR_STATUS,
  SPACES_FIELD_PARSERS,
  SPACES_HEADERS,
  SPACES_LIMITS,
  decodeLiveMember,
  encodeLiveMember,
  mayPutRecord,
  parseLiveHeaders,
  rekeyLinkId,
  spacesBodyLimit,
  spacesMemberId,
  type Parsed,
  type SpacesFields,
  type SpacesOp,
} from './contracts'
import { isSpacesEnabled, spacesMaxMembers } from './switches'

/** Shared Spaces' body parsers and switches (witness-work ADR 0037). */

const NOW = Date.UTC(2026, 9, 29, 12)
const DAY = 24 * 60 * 60_000
const KIB = 1_024
const bytes32 = () => b64u(randomBytes(32))
const member = () => ({ spaceId: randomId(), memberId: randomId(), token: bytes32() })
const record = (fields: Record<string, unknown> = {}) => ({
  recordId: 'trip-1',
  epoch: 1,
  stamp: NOW,
  blob: b64u(randomBytes(64)),
  ...fields,
})
const parse = <K extends SpacesOp>(
  op: K,
  body: Record<string, unknown>
): Parsed<SpacesFields[K]> =>
  (
    SPACES_FIELD_PARSERS[op] as (
      body: Record<string, unknown>,
      now: number
    ) => Parsed<SpacesFields[K]>
  )(body, NOW)

describe('member fields', () => {
  it('needs 22-character ids and a canonical 32-byte token', () => {
    const fields = member()
    const parsed = parse('leave', fields)
    expect(parsed.ok && parsed.value.token).toHaveLength(32)
    for (const bad of [
      { ...fields, spaceId: fields.spaceId.slice(1) },
      { ...fields, memberId: `${fields.memberId.slice(1)}=` },
      { ...fields, token: fields.token.slice(1) },
      { ...fields, token: `${fields.token.slice(0, 42)}B` },
      { ...fields, token: 7 },
    ])
      expect(parse('leave', bad)).toEqual({ ok: false, error: 'bad_request' })
  })
})

describe('put', () => {
  it('reads records with their defaults', () => {
    const parsed = parse('put', { ...member(), records: [record(), record({ deleted: true })] })
    expect(parsed.ok && parsed.value.records.map((r) => r.deleted)).toEqual([false, true])
  })

  it('takes stamps up to 24 h past now', () => {
    expect(parse('put', { ...member(), records: [record({ stamp: NOW + DAY })] }).ok).toBe(true)
    expect(parse('put', { ...member(), records: [record({ stamp: NOW + DAY + 1 })] })).toEqual({
      ok: false,
      error: 'bad_request',
    })
  })

  it('says too_large for a blob past 16 KiB or more than 100 records', () => {
    expect(
      parse('put', { ...member(), records: [record({ blob: b64u(randomBytes(16 * KIB)) })] }).ok
    ).toBe(true)
    expect(
      parse('put', { ...member(), records: [record({ blob: b64u(randomBytes(16 * KIB + 1)) })] })
    ).toEqual({ ok: false, error: 'too_large' })
    const many = Array.from({ length: SPACES_LIMITS.putRecords + 1 }, () => record())
    expect(parse('put', { ...member(), records: many })).toEqual({ ok: false, error: 'too_large' })
  })

  it('says bad_request for anything malformed, even beside an oversized blob', () => {
    expect(
      parse('put', {
        ...member(),
        records: [record({ blob: b64u(randomBytes(16 * KIB + 1)) }), record({ epoch: 0 })],
      })
    ).toEqual({ ok: false, error: 'bad_request' })
    for (const records of [[], 'records', [null], [record({ blob: 'A' })]])
      expect(parse('put', { ...member(), records })).toEqual({ ok: false, error: 'bad_request' })
  })

  it('caps put bodies at 1 MiB and others at 256 KiB', () => {
    expect(spacesBodyLimit('put')).toBe(1_024 * KIB)
    expect(spacesBodyLimit('rekey')).toBe(256 * KIB)
  })
})

describe('other ops', () => {
  it('bounds an invite to 7 days and 5 minutes ahead, at an epoch', () => {
    const invite = { ...member(), inviteId: randomId(), joinVerifier: bytes32(), epoch: 1 }
    const limit = NOW + 7 * DAY + 5 * 60_000
    const parsed = parse('invite/create', { ...invite, expiresAt: limit })
    expect(parsed.ok && parsed.value.epoch).toBe(1)
    for (const expiresAt of [limit + 1, NOW, NOW - 1, 'soon'])
      expect(parse('invite/create', { ...invite, expiresAt }).ok).toBe(false)
    for (const epoch of [undefined, 0, 1.5, '1'])
      expect(parse('invite/create', { ...invite, expiresAt: limit, epoch }).ok).toBe(false)
  })

  it('needs a 32-byte join secret, the invitation’s epoch, and a public key', () => {
    const join = {
      spaceId: randomId(),
      inviteId: randomId(),
      joinSecret: bytes32(),
      epoch: 2,
      memberId: randomId(),
      dhPub: bytes32(),
      tokenHash: bytes32(),
      wrap: b64u(randomBytes(105)),
    }
    const parsed = parse('join', join)
    expect(parsed.ok && parsed.value.epoch).toBe(2)
    for (const epoch of [undefined, 0, -1, 1.5, '2', null])
      expect(parse('join', { ...join, epoch }).ok, String(epoch)).toBe(false)
    expect(parse('join', { ...join, joinSecret: b64u(randomBytes(16)) }).ok).toBe(false)
    expect(parse('join', { ...join, wrap: b64u(randomBytes(SPACES_LIMITS.wrapBytes + 3)) }).ok).toBe(false)
    for (const dhPub of [undefined, b64u(randomBytes(31)), `${join.dhPub.slice(0, 42)}B`])
      expect(parse('join', { ...join, dhPub }).ok).toBe(false)
  })

  it('needs create’s public key', () => {
    const create = {
      spaceId: randomId(),
      memberId: randomId(),
      dhPub: bytes32(),
      tokenHash: bytes32(),
      wrap: b64u(randomBytes(105)),
    }
    const parsed = parse('create', create)
    expect(parsed.ok && parsed.value.dhPub).toBe(create.dhPub)
    expect(parse('create', { ...create, dhPub: undefined }).ok).toBe(false)
  })

  it('reads a rekey to epoch 2 or later with its wraps, each member once', () => {
    const wraps = [{ memberId: randomId(), wrap: b64u(randomBytes(105)) }]
    const link = { stamp: NOW, blob: b64u(randomBytes(90)) }
    const parsed = parse('rekey', { ...member(), epoch: 2, wraps, link })
    expect(parsed.ok && parsed.value).toMatchObject({ epoch: 2, wraps, link })
    expect(parse('rekey', { ...member(), epoch: 1, wraps, link }).ok).toBe(false)
    expect(
      parse('rekey', { ...member(), epoch: 2, wraps: [{ memberId: 'x', wrap: 'AAAA' }], link }).ok
    ).toBe(false)
    expect(
      parse('rekey', {
        ...member(),
        epoch: 2,
        wraps: [...wraps, { memberId: wraps[0].memberId, wrap: b64u(randomBytes(105)) }],
        link,
      })
    ).toEqual({ ok: false, error: 'bad_request' })
    const many = Array.from({ length: SPACES_LIMITS.maxMembersCeiling + 1 }, () => ({
      memberId: randomId(),
      wrap: b64u(randomBytes(105)),
    }))
    expect(parse('rekey', { ...member(), epoch: 2, wraps: many, link }).ok).toBe(false)
  })

  it('passes an empty wraps on, for the space to answer conflict', () => {
    const link = { stamp: NOW, blob: b64u(randomBytes(90)) }
    const parsed = parse('rekey', { ...member(), epoch: 2, wraps: [], link })
    expect(parsed.ok && parsed.value.wraps).toEqual([])
  })

  it('needs a rekey’s link, checked as a put record', () => {
    const rekey = {
      ...member(),
      epoch: 3,
      wraps: [{ memberId: randomId(), wrap: b64u(randomBytes(105)) }],
    }
    const blob = b64u(randomBytes(SPACES_LIMITS.blobBytes))
    const parsed = parse('rekey', { ...rekey, link: { stamp: NOW + DAY, blob, deleted: true } })
    // Only the stamp and blob are read: the server stores it as `k.<epoch>`, not deleted.
    expect(parsed.ok && parsed.value.link).toEqual({ stamp: NOW + DAY, blob })
    for (const link of [
      undefined,
      null,
      'link',
      [],
      { blob },
      { stamp: NOW },
      { stamp: NOW + DAY + 1, blob },
      { stamp: -1, blob },
      { stamp: 1.5, blob },
      { stamp: NOW, blob: '' },
      { stamp: NOW, blob: 'not base64!' },
    ])
      expect(parse('rekey', { ...rekey, link }), JSON.stringify(link)).toEqual({
        ok: false,
        error: 'bad_request',
      })
    const oversized = { stamp: NOW, blob: b64u(randomBytes(SPACES_LIMITS.blobBytes + 1)) }
    expect(parse('rekey', { ...rekey, link: oversized })).toEqual({
      ok: false,
      error: 'too_large',
    })
    // Anything else malformed comes first.
    expect(parse('rekey', { ...rekey, epoch: 1, link: oversized })).toEqual({
      ok: false,
      error: 'bad_request',
    })
  })

  it('defaults sync’s limit to 1,000', () => {
    const parsed = parse('sync', { ...member(), since: 0 })
    expect(parsed.ok && parsed.value.limit).toBe(SPACES_LIMITS.syncRecords)
  })
})

describe('member ids', () => {
  // witness-work src/lib/sharedSpaces/testing/spaceVectors.json: the app's
  // known answers for one member.
  const APP_VECTORS = {
    'space.id': 'EBESExQVFhcYGRobHB0eHw',
    'member.dhPub': 'Kg26TMjIGJ8vlAvtGfxnwVoKVSzwQ9LgGaj6zKsYj0g',
    'member.id': '-gvnHr8_F4ugGwH6uMmhlg',
    'member.token': 'soFtcW_cR98jInjB3CVXxLRChvio87vqKJ_uyfVtRoI',
    'member.tokenHash': 'frfhcBujTn2ysSrypUj6QzUsayuKdtSHLOZTDPnS88M',
    'invite.joinSecret': '4OHi4-Tl5ufo6err7O3u7_Dx8vP09fb3-Pn6-_z9_v8',
    'invite.joinVerifier': 'lDLBp9ND_PrLFkvcRP9xwSgcAEiGscQoQZCI0GzTVho',
  }

  it('matches the app’s known memberId, token hash, and join verifier', async () => {
    expect(
      await spacesMemberId(APP_VECTORS['space.id'], APP_VECTORS['member.dhPub'])
    ).toBe(APP_VECTORS['member.id'])
    // The Worker hashes the token and the join secret this way before the space sees them.
    const fields = parse('join', {
      spaceId: APP_VECTORS['space.id'],
      inviteId: randomId(),
      joinSecret: APP_VECTORS['invite.joinSecret'],
      epoch: 1,
      memberId: APP_VECTORS['member.id'],
      dhPub: APP_VECTORS['member.dhPub'],
      tokenHash: APP_VECTORS['member.tokenHash'],
      wrap: b64u(randomBytes(105)),
    })
    expect(fields.ok && (await sha256B64u(fields.value.joinSecret))).toBe(
      APP_VECTORS['invite.joinVerifier']
    )
    const leave = parse('leave', {
      spaceId: APP_VECTORS['space.id'],
      memberId: APP_VECTORS['member.id'],
      token: APP_VECTORS['member.token'],
    })
    expect(leave.ok && (await sha256B64u(leave.value.token))).toBe(
      APP_VECTORS['member.tokenHash']
    )
  })

  it('commits to the public key, as the app derives it', async () => {
    const spaceId = randomId()
    const dhPub = bytes32()
    const memberId = await spacesMemberId(spaceId, dhPub)
    expect(memberId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(memberId).toBe(await spaceMemberId(spaceId, dhPub))
    expect(await spacesMemberId(randomId(), dhPub)).not.toBe(memberId)
    expect(await spacesMemberId(spaceId, bytes32())).not.toBe(memberId)
  })
})

describe('live headers', () => {
  const json = (value: unknown) => b64u(new TextEncoder().encode(JSON.stringify(value)))

  it('reads the space and member from x-ww-space-auth and the token from x-ww-space-token', () => {
    const { spaceId, memberId, token } = member()
    const parsed = parseLiveHeaders(json({ spaceId, memberId }), token)
    expect(parsed).toMatchObject({ spaceId, memberId })
    expect(parsed && b64u(parsed.token)).toBe(token)
    for (const space of [
      null,
      '',
      '%%%',
      json([1]),
      json({ spaceId }),
      b64u(new Uint8Array([0xff])),
      json({ spaceId, memberId, pad: 'x'.repeat(SPACES_LIMITS.liveHeaderChars) }),
    ])
      expect(parseLiveHeaders(space, token)).toBeNull()
    for (const bad of [null, '', token.slice(1), `${token.slice(0, 42)}B`])
      expect(parseLiveHeaders(json({ spaceId, memberId }), bad)).toBeNull()
  })

  it('round-trips the Worker’s member header, cap included', () => {
    const live = { spaceId: randomId(), memberId: randomId(), tokenHash: bytes32(), maxMembers: 12 }
    expect(decodeLiveMember(encodeLiveMember(live))).toEqual(live)
    for (const maxMembers of [0, 101, 2.5, undefined])
      expect(decodeLiveMember(JSON.stringify({ ...live, maxMembers }))).toBeNull()
    expect(decodeLiveMember('not json')).toBeNull()
  })
})

describe('errors and headers', () => {
  it('owns stale_key, beside the shared envelope’s codes', () => {
    expect(SPACES_ERROR_STATUS.stale_key).toBe(409)
    expect('stale_key' in BUDDIES_ERROR_STATUS).toBe(false)
    expect(SPACES_ERROR_STATUS).toMatchObject(BUDDIES_ERROR_STATUS)
  })

  it('names every header that carries an id or a token so Cloudflare’s logs redact it', () => {
    expect(SPACES_HEADERS.live).toBe('x-ww-space-auth')
    expect(SPACES_HEADERS.liveToken).toBe('x-ww-space-token')
    expect(SPACES_HEADERS.member).toBe('x-ww-space-member-token')
  })
})

describe('reserved record ids', () => {
  const [joe, ann] = [randomId(), randomId()]

  it('keeps m.<memberId> to that member and k.<x> to the owner', () => {
    expect(mayPutRecord(`m.${joe}`, joe, ann)).toBe(true)
    expect(mayPutRecord(`m.${ann}`, joe, ann)).toBe(false)
    // An m. id that names nobody on the space yet is someone else's too.
    expect(mayPutRecord('m.someone', joe, ann)).toBe(false)
    expect(mayPutRecord('m.', joe, joe)).toBe(false)
    expect(mayPutRecord('k.2', ann, ann)).toBe(true)
    expect(mayPutRecord('k.2', joe, ann)).toBe(false)
    expect(mayPutRecord('k.', joe, ann)).toBe(false)
    expect(mayPutRecord(rekeyLinkId(3), ann, ann)).toBe(true)
  })

  it('leaves every other id to anyone', () => {
    for (const recordId of ['trip-1', `i.${randomId()}`, `M.${ann}`, 'K.2', 'mk.2', 'km', crypto.randomUUID()])
      expect(mayPutRecord(recordId, joe, ann), recordId).toBe(true)
  })
})

describe('switches', () => {
  it('turns on only for "true", KV first, then SPACES_ENABLED', async () => {
    const kv = makeMemoryKv() as unknown as KVNamespace
    expect(await isSpacesEnabled({ NOTES_KV: kv, SPACES_ENABLED: 'true' })).toBe(true)
    expect(await isSpacesEnabled({ NOTES_KV: kv, SPACES_ENABLED: 'false' })).toBe(false)
    expect(await isSpacesEnabled({ NOTES_KV: kv })).toBe(false)
    await kv.put('spaces:enabled', 'on')
    expect(await isSpacesEnabled({ NOTES_KV: kv, SPACES_ENABLED: 'true' })).toBe(false)
    await kv.put('spaces:enabled', ' true ')
    expect(await isSpacesEnabled({ NOTES_KV: kv, SPACES_ENABLED: 'false' })).toBe(true)
  })

  it('uses the var when KV can’t be read', async () => {
    const broken = { get: async () => Promise.reject(new Error('down')) }
    expect(
      await isSpacesEnabled({ NOTES_KV: broken as never, SPACES_ENABLED: 'true' })
    ).toBe(true)
    expect(await spacesMaxMembers({ NOTES_KV: broken as never })).toBe(10)
  })

  it('reads spaces:maxMembers as a whole number from 1 to 100, else 10', async () => {
    const kv = makeMemoryKv() as unknown as KVNamespace
    expect(await spacesMaxMembers({ NOTES_KV: kv })).toBe(10)
    for (const [value, cap] of [
      ['12', 12],
      [' 1 ', 1],
      ['100', 100],
      ['101', 10],
      ['0', 10],
      ['-3', 10],
      ['2.5', 10],
      ['ten', 10],
    ] as const) {
      await kv.put('spaces:maxMembers', value)
      expect(await spacesMaxMembers({ NOTES_KV: kv }), value).toBe(cap)
    }
  })
})
