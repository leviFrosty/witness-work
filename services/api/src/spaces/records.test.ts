import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHarness, b64u, randomBytes, randomId, type Harness } from '../test/buddies'
import { bearer } from '../test/accounts'
import { SpaceMember, spacesError, spacesRoutes } from '../test/spaces'
import { SPACES_LIMITS } from './contracts'

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

/**
 * Shared Spaces records (witness-work ADR 0037): `put`'s newest-stamp rule
 * and its tie-breaks, concurrent writers, `stale_key`, the caps and rate
 * limits, and `sync`'s paging.
 */

const START = Date.UTC(2026, 9, 29, 12)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const KIB = 1_024

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

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)

const owned = async (): Promise<SpaceMember> => {
  const owner = await SpaceMember.open(h.env)
  expect((await owner.create()).status).toBe(200)
  return owner
}

const sha256Hex = async (blob: string): Promise<string> => {
  const bytes = Uint8Array.from(atob(blob.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0)
  )
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('')
}

/** Two different blobs, the first with the lower SHA-256. */
const orderedBlobs = async (): Promise<[string, string]> => {
  const a = b64u(randomBytes(48))
  const b = b64u(randomBytes(48))
  return (await sha256Hex(a)) < (await sha256Hex(b)) ? [a, b] : [b, a]
}

const ids = (records: { recordId: string }[]) => records.map((record) => record.recordId)

/** The space's running byte count, and the sum it should equal. */
const bytesOf = (member: SpaceMember) => {
  const storage = h.spaces.storage(member.spaceId)
  return {
    counted: storage.query('SELECT blob_bytes AS n FROM space')[0].n,
    held: storage.query('SELECT COALESCE(SUM(blob_bytes), 0) AS n FROM record')[0].n,
  }
}

const held = async (member: SpaceMember, recordId: string) =>
  ((await member.sync()).body.records as { recordId: string }[]).find(
    (record) => record.recordId === recordId
  )

describe('put and sync', () => {
  it('stores records, each at the next seq, and syncs them in seq order', async () => {
    const owner = await owned()
    const put = await owner.put([
      { recordId: 'car-1', stamp: START - 2, blob: 'AAAA' },
      { recordId: 'trip-1', stamp: START - 1, blob: 'BBBB' },
      { recordId: 'trip-2', deleted: true, blob: 'CCCC' },
    ])
    expect(put.body).toEqual({
      ok: true,
      seq: 4,
      results: [
        { recordId: 'car-1', stored: true },
        { recordId: 'trip-1', stored: true },
        { recordId: 'trip-2', stored: true },
      ],
    })
    expect((await owner.sync()).body.records).toEqual([
      { recordId: 'car-1', epoch: 1, stamp: START - 2, deleted: false, blob: 'AAAA', seq: 2 },
      { recordId: 'trip-1', epoch: 1, stamp: START - 1, deleted: false, blob: 'BBBB', seq: 3 },
      { recordId: 'trip-2', epoch: 1, stamp: START, deleted: true, blob: 'CCCC', seq: 4 },
    ])
    // A newer version moves the record to the end.
    await owner.put([{ recordId: 'car-1', stamp: START + 5, blob: 'DDDD' }])
    const since = await owner.sync(3)
    expect(since.body.seq).toBe(5)
    expect(since.body.records.map((r: { recordId: string }) => r.recordId)).toEqual([
      'trip-2',
      'car-1',
    ])
  })

  it('shares records between members', async () => {
    const owner = await owned()
    const joe = await owner.other()
    await joe.joinVia(owner)
    await joe.put([{ recordId: 'trip-1', blob: 'AAAA' }])
    expect(await held(owner, 'trip-1')).toMatchObject({ blob: 'AAAA' })
  })
})

describe('newest stamp wins', () => {
  it('keeps the higher stamp either way round', async () => {
    const owner = await owned()
    await owner.put([{ recordId: 'r', stamp: 100, blob: 'AAAA' }])
    const older = await owner.put([{ recordId: 'r', stamp: 99, blob: 'BBBB' }])
    expect(older.body).toEqual({ ok: true, seq: 2, results: [{ recordId: 'r', stored: false }] })
    expect(await held(owner, 'r')).toMatchObject({ stamp: 100, blob: 'AAAA' })
    const newer = await owner.put([{ recordId: 'r', stamp: 101, blob: 'CCCC' }])
    expect(newer.body).toEqual({ ok: true, seq: 3, results: [{ recordId: 'r', stored: true }] })
    expect(await held(owner, 'r')).toMatchObject({ stamp: 101, blob: 'CCCC' })
    // A deletion with an older stamp loses too.
    await owner.put([{ recordId: 'r', stamp: 100, deleted: true }])
    expect(await held(owner, 'r')).toMatchObject({ deleted: false })
  })

  it('lets a deletion win a tie, whichever arrives first', async () => {
    const owner = await owned()
    await owner.put([{ recordId: 'a', stamp: 5, blob: 'AAAA' }])
    const deletion = await owner.put([{ recordId: 'a', stamp: 5, deleted: true, blob: 'BBBB' }])
    expect(deletion.body.results).toEqual([{ recordId: 'a', stored: true }])
    expect(await held(owner, 'a')).toMatchObject({ deleted: true, blob: 'BBBB' })

    await owner.put([{ recordId: 'b', stamp: 5, deleted: true, blob: 'BBBB' }])
    const edit = await owner.put([{ recordId: 'b', stamp: 5, blob: 'AAAA' }])
    expect(edit.body.results).toEqual([{ recordId: 'b', stored: false }])
    expect(await held(owner, 'b')).toMatchObject({ deleted: true })
  })

  it('then keeps the lower SHA-256 of the blob, whichever arrives first', async () => {
    const owner = await owned()
    for (const deleted of [false, true]) {
      const [low, high] = await orderedBlobs()
      await owner.put([{ recordId: `up-${deleted}`, stamp: 7, deleted, blob: high }])
      const lower = await owner.put([{ recordId: `up-${deleted}`, stamp: 7, deleted, blob: low }])
      expect(lower.body.results[0].stored).toBe(true)
      expect(await held(owner, `up-${deleted}`)).toMatchObject({ blob: low })

      await owner.put([{ recordId: `down-${deleted}`, stamp: 7, deleted, blob: low }])
      const higher = await owner.put([{ recordId: `down-${deleted}`, stamp: 7, deleted, blob: high }])
      expect(higher.body.results[0].stored).toBe(false)
      expect(await held(owner, `down-${deleted}`)).toMatchObject({ blob: low })
    }
  })

  it('answers a resent version stored without taking a new seq', async () => {
    const owner = await owned()
    const record = { recordId: 'r', stamp: 9, blob: 'AAAA' }
    const first = await owner.put([record])
    const again = await owner.put([record])
    expect(again.body).toEqual({ ok: true, seq: first.body.seq, results: [{ recordId: 'r', stored: true }] })
  })

  it('converges when three members put one record at once', async () => {
    const owner = await owned()
    const joe = await owner.other()
    const ann = await owner.other()
    await joe.joinVia(owner)
    await ann.joinVia(owner)
    const [low, high] = await orderedBlobs()
    const results = await Promise.all([
      owner.put([{ recordId: 'trip', stamp: 10, blob: high }]),
      joe.put([{ recordId: 'trip', stamp: 10, blob: low }]),
      ann.put([{ recordId: 'trip', stamp: 9, blob: 'AAAA' }]),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200, 200])
    // Joe's (newest stamp, then the lower hash) wins whatever order they ran
    // in, so it's stored whenever it lands.
    expect(results[1].body.results).toEqual([{ recordId: 'trip', stored: true }])
    const views = await Promise.all([owner, joe, ann].map((member) => held(member, 'trip')))
    for (const view of views) expect(view).toEqual(views[0])
    expect(views[0]).toMatchObject({ stamp: 10, blob: low })

    // A deletion at the same stamp beats both, at once too.
    const deletions = await Promise.all([
      owner.put([{ recordId: 'trip', stamp: 10, blob: high }]),
      ann.put([{ recordId: 'trip', stamp: 10, deleted: true, blob: 'BBBB' }]),
      joe.put([{ recordId: 'trip', stamp: 10, blob: low }]),
    ])
    expect(deletions[1].body.results).toEqual([{ recordId: 'trip', stored: true }])
    for (const member of [owner, joe, ann])
      expect(await held(member, 'trip')).toMatchObject({ deleted: true, blob: 'BBBB' })
  })

  it('applies records of one put in order', async () => {
    const owner = await owned()
    const put = await owner.put([
      { recordId: 'r', stamp: 2, blob: 'AAAA' },
      { recordId: 'r', stamp: 1, blob: 'BBBB' },
      { recordId: 'r', stamp: 3, blob: 'CCCC' },
    ])
    expect(put.body.results.map((r: { stored: boolean }) => r.stored)).toEqual([true, false, true])
    expect(await held(owner, 'r')).toMatchObject({ stamp: 3, blob: 'CCCC', seq: 3 })
  })
})

describe('epochs and stamps', () => {
  it('stores nothing when any record’s epoch isn’t current', async () => {
    const owner = await owned()
    const stale = await owner.put([{ recordId: 'ok' }, { recordId: 'old', epoch: 2 }])
    expect(stale).toMatchObject({ status: 409, body: spacesError('stale_key') })
    expect((await owner.sync()).body).toMatchObject({ seq: 1, records: [] })
    expect(bytesOf(owner)).toEqual({ counted: 0, held: 0 })
  })

  it('takes stamps up to 24 h past the server’s clock, and no further', async () => {
    const owner = await owned()
    expect((await owner.put([{ stamp: Date.now() + DAY }])).status).toBe(200)
    expect((await owner.put([{ stamp: Date.now() + DAY + 1 }])).body).toEqual(
      spacesError('bad_request')
    )
  })

  it('refuses malformed records', async () => {
    const owner = await owned()
    for (const records of [
      [],
      [{ recordId: '' }],
      [{ recordId: 'a'.repeat(65) }],
      [{ recordId: 'no spaces' }],
      [{ epoch: 0 }],
      [{ stamp: -1 }],
      [{ stamp: 1.5 }],
      [{ blob: '' }],
      [{ blob: 'not base64!' }],
    ])
      expect((await owner.put(records)).body, JSON.stringify(records)).toEqual(
        spacesError('bad_request')
      )
    expect(
      (await owner.send('put', {
        ...owner.fields,
        records: [{ recordId: 'a', epoch: 1, stamp: 0, deleted: 'yes', blob: 'AAAA' }],
      })).body
    ).toEqual(spacesError('bad_request'))
  })
})

describe('reserved ids', () => {
  /** An owner and Joe on one space, with their own m. records stored. */
  const pair = async () => {
    const owner = await owned()
    const joe = await owner.other()
    await joe.joinVia(owner)
    for (const member of [owner, joe])
      expect((await member.put([{ recordId: `m.${member.memberId}`, stamp: 1 }])).status).toBe(200)
    return { owner, joe, head: (await owner.sync()).body.seq as number }
  }

  it('keeps m.<memberId> to that member, the owner included', async () => {
    const { owner, joe, head } = await pair()
    for (const [writer, other] of [
      [joe, owner],
      [owner, joe],
    ] as const)
      expect(
        await writer.put([{ recordId: `m.${other.memberId}`, stamp: Date.now() + DAY }])
      ).toMatchObject({ status: 403, body: spacesError('forbidden') })
    // An m. id that names nobody yet is someone else's too.
    expect((await joe.put([{ recordId: `m.${randomId()}` }])).body).toEqual(spacesError('forbidden'))
    // Each still puts their own.
    expect((await joe.put([{ recordId: `m.${joe.memberId}`, stamp: 2 }])).status).toBe(200)
    expect((await owner.sync(head)).body.records.map((r: { recordId: string }) => r.recordId)).toEqual([
      `m.${joe.memberId}`,
    ])
  })

  it('keeps k.<x> to the owner, whoever that is now', async () => {
    const { owner, joe } = await pair()
    expect(await joe.put([{ recordId: 'k.2' }])).toMatchObject({
      status: 403,
      body: spacesError('forbidden'),
    })
    expect((await owner.put([{ recordId: 'k.2' }])).status).toBe(200)
    // Once the owner leaves, Joe owns the space and its key chain.
    expect((await owner.leave()).status).toBe(200)
    expect((await joe.put([{ recordId: 'k.3' }])).status).toBe(200)
    expect(await held(joe, 'k.3')).toBeDefined()
  })

  it('refuses a put naming someone else’s whole, storing none of it', async () => {
    const { owner, joe, head } = await pair()
    const before = bytesOf(owner)
    for (const reserved of [`m.${owner.memberId}`, 'k.2'])
      expect(
        (await joe.put([{ recordId: 'trip-1' }, { recordId: `m.${joe.memberId}`, stamp: 3 }, { recordId: reserved }]))
          .body
      ).toEqual(spacesError('forbidden'))
    expect((await owner.sync(head)).body).toMatchObject({ seq: head, records: [] })
    expect(bytesOf(owner)).toEqual(before)
  })

  it('refuses a deletion of someone else’s m. record', async () => {
    const { owner, joe, head } = await pair()
    for (const [writer, other] of [
      [joe, owner],
      [owner, joe],
    ] as const)
      expect(
        (await writer.put([{ recordId: `m.${other.memberId}`, stamp: Date.now(), deleted: true }])).body
      ).toEqual(spacesError('forbidden'))
    expect(await held(owner, `m.${joe.memberId}`)).toMatchObject({ deleted: false, stamp: 1 })
    expect(await held(joe, `m.${owner.memberId}`)).toMatchObject({ deleted: false, stamp: 1 })
    expect((await owner.sync()).body.seq).toBe(head)
  })

  it('doesn’t count a forbidden put against the member, and says forbidden before stale_key', async () => {
    const { owner, joe } = await pair()
    advance(MINUTE)
    for (let i = 0; i < SPACES_LIMITS.memberPuts + 5; i++)
      expect((await joe.put([{ recordId: 'k.2', epoch: 2 }])).body).toEqual(spacesError('forbidden'))
    // Nothing was written for them: only the put pair() made a minute ago.
    expect(
      h.spaces.storage(owner.spaceId).query('SELECT at, puts FROM member_put WHERE member_id = ?', joe.memberId)
    ).toEqual([{ at: START, puts: 1 }])
    for (let i = 0; i < SPACES_LIMITS.memberPuts; i++)
      expect((await joe.put([{}])).status).toBe(200)
    expect((await joe.put([{}])).body.code).toBe('rate_limited')
  })
})

describe('caps', () => {
  it('takes 100 records and 16 KiB blobs a put', async () => {
    const owner = await owned()
    const records = Array.from({ length: SPACES_LIMITS.putRecords }, () => ({}))
    expect((await owner.put(records)).status).toBe(200)
    expect(await owner.put([...records, {}])).toMatchObject({
      status: 413,
      body: spacesError('too_large'),
    })
    expect((await owner.put([{ blob: b64u(randomBytes(16 * KIB)) }])).status).toBe(200)
    expect((await owner.put([{ blob: b64u(randomBytes(16 * KIB + 1)) }])).body).toEqual(
      spacesError('too_large')
    )
  })

  it('refuses a body over 1 MiB, declared or not', async () => {
    const owner = await owned()
    const records = Array.from({ length: 70 }, () => ({ blob: b64u(randomBytes(15 * KIB)) }))
    expect(await owner.put(records)).toMatchObject({ status: 413, body: spacesError('too_large') })
    // Streamed without a Content-Length: refused once it passes 1 MiB.
    const body = new TextEncoder().encode(
      JSON.stringify({
        ...owner.fields,
        records: Array.from({ length: 70 }, () => ({
          recordId: 'r',
          epoch: 1,
          stamp: 1,
          blob: b64u(randomBytes(15 * KIB)),
        })),
      })
    )
    expect(body.byteLength).toBeGreaterThan(SPACES_LIMITS.putBytes)
    const streamed = await spacesRoutes.request(
      '/put',
      {
        method: 'POST',
        headers: { ...bearer(owner.session.accessToken), 'content-type': 'application/json' },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            for (let at = 0; at < body.byteLength; at += 64 * KIB)
              controller.enqueue(body.slice(at, at + 64 * KIB))
            controller.close()
          },
        }),
        // @ts-expect-error Node's fetch requires duplex for streamed bodies.
        duplex: 'half',
      },
      h.env
    )
    expect(streamed.status).toBe(413)
    expect(await streamed.json()).toEqual(spacesError('too_large'))
    expect((await owner.sync()).body.records).toEqual([])
  })

  it('refuses any other op’s body over 256 KiB', async () => {
    const owner = await owned()
    const pad = 'x'.repeat(SPACES_LIMITS.requestBytes)
    for (const op of ['sync', 'invite/create', 'leave', 'rekey', 'delete'])
      expect(
        await owner.send(op, { ...owner.fields, since: 0, pad }),
        op
      ).toMatchObject({ status: 413, body: spacesError('too_large') })
    // Just under it parses (and the extra field is ignored).
    const under = await owner.send('sync', {
      ...owner.fields,
      since: 0,
      pad: 'x'.repeat(SPACES_LIMITS.requestBytes - 300),
    })
    expect(under.status).toBe(200)
    expect((await owner.sync()).status).toBe(200)
  })

  it('holds a space to 50,000 records, deletions included', async () => {
    const owner = await owned()
    const storage = h.spaces.storage(owner.spaceId)
    const seeded = SPACES_LIMITS.records - 2
    storage.query(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO record (record_id, epoch, stamp, deleted, blob, blob_hash, blob_bytes, seq)
       SELECT 'seed-' || i, 1, 0, i % 2, 'AAAA', 'ff', 3, i + 1 FROM n`,
      seeded
    )
    storage.query(
      'UPDATE space SET seq = ?, record_count = ?, blob_bytes = ?',
      seeded + 1,
      seeded,
      seeded * 3
    )
    const over = await owner.put([{}, {}, {}])
    expect(over).toMatchObject({ status: 429, body: spacesError('limit') })
    expect(over.headers.get('retry-after')).toBeNull()
    // Versions of records it holds still land.
    expect((await owner.put([{ recordId: 'seed-1', stamp: 1 }, {}, {}])).status).toBe(200)
    expect((await owner.put([{}])).body).toEqual(spacesError('limit'))
    expect(storage.query('SELECT record_count AS n FROM space')[0].n).toBe(
      SPACES_LIMITS.records
    )
    expect(storage.query('SELECT COUNT(*) AS n FROM record')[0].n).toBe(
      SPACES_LIMITS.records
    )
  })

  it('counts decoded blob bytes, giving back what a newer version replaces', async () => {
    const owner = await owned()
    await owner.put([
      { recordId: 'a', stamp: 1, blob: b64u(randomBytes(1_000)) },
      { recordId: 'b', stamp: 1, blob: b64u(randomBytes(500)) },
    ])
    expect(bytesOf(owner)).toEqual({ counted: 1_500, held: 1_500 })
    // Replaced by a smaller version, then by a deletion; an older one changes nothing.
    await owner.put([{ recordId: 'a', stamp: 2, blob: b64u(randomBytes(100)) }])
    await owner.put([{ recordId: 'b', stamp: 2, deleted: true, blob: b64u(randomBytes(40)) }])
    await owner.put([{ recordId: 'b', stamp: 1, blob: b64u(randomBytes(9_000)) }])
    expect(bytesOf(owner)).toEqual({ counted: 140, held: 140 })
    // One put holding a record twice counts only the version it keeps.
    await owner.put([
      { recordId: 'c', stamp: 1, blob: b64u(randomBytes(300)) },
      { recordId: 'c', stamp: 2, blob: b64u(randomBytes(30)) },
      { recordId: 'c', stamp: 1, blob: b64u(randomBytes(3_000)) },
    ])
    expect(bytesOf(owner)).toEqual({ counted: 170, held: 170 })
  })

  it('holds a space to 256 MiB of decoded blobs, deletions included', async () => {
    const owner = await owned()
    await owner.put([{ recordId: 'r', stamp: 1, blob: b64u(randomBytes(1_000)) }])
    const storage = h.spaces.storage(owner.spaceId)
    const room = 2_000
    storage.query('UPDATE space SET blob_bytes = ?', SPACES_LIMITS.spaceBytes - room)
    const over = await owner.put([
      { blob: b64u(randomBytes(1_500)) },
      { deleted: true, blob: b64u(randomBytes(501)) },
    ])
    expect(over).toMatchObject({ status: 429, body: spacesError('limit') })
    expect(over.headers.get('retry-after')).toBeNull()
    // Exactly to the cap is fine, and so is shrinking a record once there.
    expect((await owner.put([{ blob: b64u(randomBytes(room)) }])).status).toBe(200)
    expect((await owner.put([{ blob: 'AAAA' }])).body).toEqual(spacesError('limit'))
    expect(
      (await owner.put([{ recordId: 'r', stamp: 2, blob: b64u(randomBytes(10)) }])).status
    ).toBe(200)
    expect(storage.query('SELECT blob_bytes AS n FROM space')[0].n).toBe(
      SPACES_LIMITS.spaceBytes - 990
    )
  })

  it('takes 60 puts a minute per member', async () => {
    const owner = await owned()
    const joe = await owner.other()
    await joe.joinVia(owner)
    vi.setSystemTime(Math.ceil(Date.now() / MINUTE) * MINUTE)
    for (let i = 0; i < SPACES_LIMITS.memberPuts; i++)
      expect((await owner.put([{}])).status).toBe(200)
    const refused = await owner.put([{}])
    expect(refused).toMatchObject({ status: 429, body: { code: 'rate_limited', retryAfter: 60 } })
    expect(refused.headers.get('retry-after')).toBe('60')
    // Another member has their own.
    expect((await joe.put([{}])).status).toBe(200)
    advance(MINUTE)
    expect((await owner.put([{}])).status).toBe(200)
  })

  it('counts puts over a rolling minute, not a fixed one', async () => {
    const owner = await owned()
    // Half the budget just before a minute starts, half just after it.
    const boundary = Math.ceil(Date.now() / MINUTE) * MINUTE
    vi.setSystemTime(boundary - 1_000)
    for (let i = 0; i < SPACES_LIMITS.memberPuts / 2; i++)
      expect((await owner.put([{}])).status).toBe(200)
    vi.setSystemTime(boundary + 1_000)
    for (let i = 0; i < SPACES_LIMITS.memberPuts / 2; i++)
      expect((await owner.put([{}])).status).toBe(200)
    // A fixed window would take 30 more here; the minute is full until the first half ages out.
    const refused = await owner.put([{}])
    expect(refused).toMatchObject({ status: 429, body: { code: 'rate_limited', retryAfter: 58 } })
    vi.setSystemTime(boundary - 1_000 + MINUTE - 1)
    expect((await owner.put([{}])).body.code).toBe('rate_limited')
    vi.setSystemTime(boundary - 1_000 + MINUTE)
    for (let i = 0; i < SPACES_LIMITS.memberPuts / 2; i++)
      expect((await owner.put([{}])).status).toBe(200)
    expect((await owner.put([{}])).body.code).toBe('rate_limited')
  })

  it('doesn’t count a stale_key put, or one that failed, against the member', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const owner = await owned()
    vi.setSystemTime(Math.ceil(Date.now() / MINUTE) * MINUTE)
    for (let i = 0; i < SPACES_LIMITS.memberPuts; i++)
      expect((await owner.put([{ epoch: 2 }])).body).toEqual(spacesError('stale_key'))
    // A put whose transaction throws (rolled back) costs nothing either.
    const storage = h.spaces.storage(owner.spaceId)
    storage.query('DROP TABLE put_hour')
    for (let i = 0; i < 3; i++) expect((await owner.put([{}])).status).toBe(500)
    storage.query('CREATE TABLE put_hour (hour INTEGER PRIMARY KEY, records INTEGER NOT NULL)')
    expect((await owner.sync()).body).toMatchObject({ seq: 1, records: [] })
    for (let i = 0; i < SPACES_LIMITS.memberPuts; i++)
      expect((await owner.put([{}])).status).toBe(200)
    expect((await owner.put([{}])).body.code).toBe('rate_limited')
    // At the limit, a stale put still says stale_key.
    expect((await owner.put([{ epoch: 2 }])).body).toEqual(spacesError('stale_key'))
  })

  it('counts a put refused by a cap against the member', async () => {
    const owner = await owned()
    vi.setSystemTime(Math.ceil(Date.now() / MINUTE) * MINUTE)
    h.spaces.storage(owner.spaceId).query('UPDATE space SET record_count = ?', SPACES_LIMITS.records)
    for (let i = 0; i < SPACES_LIMITS.memberPuts; i++)
      expect((await owner.put([{}])).body).toEqual(spacesError('limit'))
    expect((await owner.put([{}])).body.code).toBe('rate_limited')
  })

  it('takes 10,000 records a rolling day per space', async () => {
    const owner = await owned()
    const storage = h.spaces.storage(owner.spaceId)
    const hour = Math.floor(Date.now() / HOUR)
    storage.query('INSERT INTO put_hour (hour, records) VALUES (?, ?)', hour - 23, 6_000)
    storage.query('INSERT INTO put_hour (hour, records) VALUES (?, ?)', hour - 1, 3_950)
    const records = Array.from({ length: 50 }, () => ({}))
    expect((await owner.put(records)).status).toBe(200)
    const refused = await owner.put([{}])
    expect(refused.status).toBe(429)
    expect(refused.body.code).toBe('rate_limited')
    // Room once the oldest hour leaves the day.
    const frees = (hour - 23 + 24) * HOUR
    expect(refused.body.retryAfter).toBe(Math.ceil((frees - Date.now()) / 1_000))
    vi.setSystemTime(frees)
    expect((await owner.put(records)).status).toBe(200)
  })
})

describe('sync paging', () => {
  it('pages with limit and more, from the last seq returned', async () => {
    const owner = await owned()
    await owner.put(Array.from({ length: 5 }, (_, i) => ({ recordId: `r${i}` })))
    const first = await owner.sync(0, { limit: 2 })
    expect(first.body).toMatchObject({ seq: 3, more: true })
    expect(first.body.records.map((r: { recordId: string }) => r.recordId)).toEqual(['r0', 'r1'])
    const second = await owner.sync(first.body.seq, { limit: 2 })
    expect(second.body).toMatchObject({ seq: 5, more: true })
    const last = await owner.sync(second.body.seq, { limit: 2 })
    expect(last.body).toMatchObject({ seq: 6, more: false })
    expect(last.body.records.map((r: { recordId: string }) => r.recordId)).toEqual(['r4'])
    // Exactly a page left is not more.
    expect((await owner.sync(4, { limit: 2 })).body).toMatchObject({ seq: 6, more: false })
    expect((await owner.sync(6)).body).toMatchObject({ seq: 6, more: false, records: [] })
  })

  it('answers a since past the head with the head and nothing else', async () => {
    const owner = await owned()
    await owner.put([{ recordId: 'r0' }, { recordId: 'r1' }])
    expect((await owner.sync(1_000)).body).toMatchObject({
      ok: true,
      seq: 3,
      records: [],
      more: false,
      members: [{ memberId: owner.memberId }],
    })
  })

  it('neither repeats nor misses a record rewritten while paging', async () => {
    const owner = await owned()
    const joe = await owner.other()
    await joe.joinVia(owner)
    await owner.put(Array.from({ length: 6 }, (_, i) => ({ recordId: `r${i}`, stamp: 1 })))
    const first = await joe.sync(0, { limit: 2 })
    expect(ids(first.body.records)).toEqual(['r0', 'r1'])
    // Mid-paging, the owner rewrites one record already read and one not yet.
    await owner.put([
      { recordId: 'r3', stamp: 2, blob: 'NEW3' },
      { recordId: 'r0', stamp: 2, blob: 'NEW0' },
    ])
    const pages = [first.body]
    while (pages.at(-1)!.more)
      pages.push((await joe.sync(pages.at(-1)!.seq, { limit: 2 })).body)
    const seen = pages.flatMap((page) => ids(page.records))
    // r3 comes once, at its new seq; r0 comes again with its new version.
    expect(seen).toEqual(['r0', 'r1', 'r2', 'r4', 'r5', 'r3', 'r0'])
    const last = new Map(
      pages.flatMap((page) => page.records).map((r: { recordId: string }) => [r.recordId, r])
    )
    expect(last.get('r3')).toMatchObject({ stamp: 2, blob: 'NEW3' })
    expect(last.get('r0')).toMatchObject({ stamp: 2, blob: 'NEW0' })
    expect(pages.at(-1)!.seq).toBe((await owner.sync()).body.seq)
  })

  it('stops a page at 4 MiB of blobs', async () => {
    const owner = await owned()
    for (let i = 0; i < 5; i++)
      await owner.put(Array.from({ length: 45 }, () => ({ blob: b64u(randomBytes(16 * KIB)) })))
    const page = await owner.sync(0)
    expect(page.body.more).toBe(true)
    const chars = page.body.records.reduce((sum: number, r: { blob: string }) => sum + r.blob.length, 0)
    expect(chars).toBeLessThanOrEqual(SPACES_LIMITS.syncChars)
    // As full as it can be: one more record wouldn't have fit.
    expect(chars + 16 * KIB * (4 / 3)).toBeGreaterThan(SPACES_LIMITS.syncChars)
    expect(page.body.records.length).toBeGreaterThan(150)
    const rest = await owner.sync(page.body.seq)
    expect(rest.body.more).toBe(false)
    expect(page.body.records.length + rest.body.records.length).toBe(225)
    // Every record once, in seq order.
    const seqs = [...page.body.records, ...rest.body.records].map((r: { seq: number }) => r.seq)
    expect(seqs).toEqual(Array.from({ length: 225 }, (_, i) => i + 2))
  })

  it('always holds at least one record, however large', async () => {
    const owner = await owned()
    await owner.put([{ recordId: 'big', blob: b64u(randomBytes(16 * KIB)) }, { recordId: 'next' }])
    const storage = h.spaces.storage(owner.spaceId)
    // A record held from before the cap was lower than the page budget.
    storage.query("UPDATE record SET blob = ? WHERE record_id = 'big'", 'A'.repeat(SPACES_LIMITS.syncChars + 4))
    const page = await owner.sync(0)
    expect(ids(page.body.records)).toEqual(['big'])
    expect(page.body).toMatchObject({ more: true, seq: 2 })
    expect(ids((await owner.sync(2)).body.records)).toEqual(['next'])
  })

  it('says more only when a record is left past a limit of a whole chunk or more', async () => {
    const owner = await owned()
    // 64 rows a chunk: a limit of 64 or more reads whole chunks.
    await owner.put(Array.from({ length: 64 }, (_, i) => ({ recordId: `r${i}` })))
    await owner.put(Array.from({ length: 64 }, (_, i) => ({ recordId: `s${i}` })))
    for (const [since, limit, count, more] of [
      [0, 64, 64, true],
      // Records hold seqs 2 to 129: after 65, exactly 64 are left.
      [65, 64, 64, false],
      [65, 100, 64, false],
      [64, 64, 64, true],
      [0, 128, 128, false],
      [0, 127, 127, true],
      [1, 128, 128, false],
      [0, 1_000, 128, false],
    ] as const) {
      const page = (await owner.sync(since, { limit })).body
      expect({ count: page.records.length, more: page.more }, `${since} ${limit}`).toEqual({ count, more })
      expect(page.seq).toBe(more ? page.records.at(-1).seq : 129)
    }
  })

  it('refuses a limit outside 1 to 1,000 and a negative since', async () => {
    const owner = await owned()
    for (const extra of [{ limit: 0 }, { limit: 1_001 }, { limit: 'all' }])
      expect((await owner.sync(0, extra)).body).toEqual(spacesError('bad_request'))
    expect((await owner.sync(-1)).body).toEqual(spacesError('bad_request'))
    expect((await owner.sync(0, { limit: 1_000 })).status).toBe(200)
  })
})

describe('activity', () => {
  it('records a sync once a day and every put, not other ops', async () => {
    const owner = await owned()
    const lastActive = () =>
      h.spaces.storage(owner.spaceId).query('SELECT last_active_at AS at FROM space')[0].at
    advance(HOUR)
    await owner.invite()
    await owner.sync()
    // A sync within a day of the activity recorded writes nothing.
    expect(lastActive()).toBe(START)
    advance(DAY - HOUR)
    await owner.sync()
    expect(lastActive()).toBe(START)
    advance(1)
    await owner.sync()
    expect(lastActive()).toBe(START + DAY + 1)
    // A put writes anyway, so it always records it.
    advance(HOUR)
    await owner.put([{}])
    expect(lastActive()).toBe(START + DAY + 1 + HOUR)
  })
})
