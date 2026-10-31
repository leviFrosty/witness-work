import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromB64u, toB64u } from '@/lib/bytes'
import {
  isSpaceError,
  SpaceError,
  type SpaceMemberAuth,
  type SpacesClient,
} from '@/lib/sharedSpaces/client'
import {
  deriveSpaceMember,
  newSpaceId,
  wrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import {
  coolDownFor,
  createBackPressure,
} from '@/lib/sharedSpaces/backPressure'
import { sealRecord } from '@/lib/sharedSpaces/records'
import {
  createFakeSpacesServer,
  FAKE_SPACES_URL,
  fakeSpacesClient,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

let server: FakeSpacesServer
let client: SpacesClient
let seed: Uint8Array
let fetched: string[]
/** How long the fake server takes to answer a `sync`. */
let syncDelayMs: number

beforeEach(() => {
  // Retries wait no time.
  vi.spyOn(Math, 'random').mockReturnValue(0)
  server = createFakeSpacesServer({ now: Date.now })
  fetched = []
  syncDelayMs = 0
  const fetchImpl = server.fetchImpl
  server.fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit
  ) => {
    fetched.push(String(url))
    if (syncDelayMs > 0 && String(url).endsWith('/sync'))
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, syncDelayMs)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    return fetchImpl(url, init)
  }) as typeof fetch
  ;({ client, accountKey: seed } = fakeSpacesClient(server, {
    randomBytes: random,
  }))
})

afterEach(() => vi.restoreAllMocks())

async function createSpace(): Promise<SpaceMemberAuth & { key: Uint8Array }> {
  const spaceId = newSpaceId(random)
  const member = deriveSpaceMember(seed, spaceId)
  const key = random(32)
  await client.create({
    spaceId,
    memberId: member.memberId,
    dhPub: member.dhPub,
    tokenHash: member.tokenHash,
    wrap: wrapSpaceKey(
      key,
      member.dhPub,
      { spaceId, epoch: 1, memberId: member.memberId },
      { ephemeral: random(32), nonce: random(24) }
    ),
  })
  return { spaceId, memberId: member.memberId, token: member.token, key }
}

const record = (
  auth: { spaceId: string; key: Uint8Array },
  recordId: string,
  stamp: number
) => ({
  recordId,
  epoch: 1,
  stamp,
  blob: sealRecord(
    auth.key,
    { spaceId: auth.spaceId, epoch: 1, recordId, deleted: false, stamp },
    { kind: 'trip', data: { n: stamp } },
    random(24)
  ),
})

async function refusal(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    return error
  }
  throw new Error('Expected a refusal')
}

describe('spaces client', () => {
  it('creates, puts and syncs through the account session', async () => {
    const space = await createSpace()
    const put = await client.put(space, [record(space, 'a', 10)])
    expect(put.results).toEqual([{ recordId: 'a', stored: true }])
    const page = await client.sync(space, { since: 0 })
    expect(page).toMatchObject({
      epoch: 1,
      ownerId: space.memberId,
      members: [{ memberId: space.memberId }],
      more: false,
      cursor: put.seq,
    })
    expect(page.records.map((r) => r.recordId)).toEqual(['a'])
  })

  it('keeps ids and secrets out of every URL', async () => {
    const space = await createSpace()
    await client.sync(space, { since: 0 })
    for (const url of fetched) {
      expect(url.startsWith(FAKE_SPACES_URL)).toBe(true)
      expect(url).not.toContain(space.spaceId)
      expect(url).not.toContain(space.memberId)
      expect(url).not.toContain(space.token)
    }
  })

  it('pages a sync while the server says there is more', async () => {
    const space = await createSpace()
    await client.put(
      space,
      [1, 2, 3, 4, 5].map((n) => record(space, `r${n}`, n))
    )
    const pages: string[][] = []
    const last = await client.syncFrom(
      space,
      0,
      (page) => {
        pages.push(page.records.map((r) => r.recordId))
      },
      { limit: 2 }
    )
    expect(pages).toEqual([['r1', 'r2'], ['r3', 'r4'], ['r5']])
    expect(last.more).toBe(false)
  })

  it('refreshes an access token the server stopped taking, once', async () => {
    const space = await createSpace()
    server.expireAccessTokens()
    server.state.log.length = 0
    await client.sync(space, { since: 0 })
    expect(server.state.log).toEqual(['sync', 'sync'])
  })

  it('maps each refusal to its code, with the wait the server asked for', async () => {
    const space = await createSpace()
    const cases: [string, number, string, number?][] = [
      ['invite/create', 409, 'stale_key'],
      ['invite/create', 410, 'gone'],
      ['invite/create', 403, 'forbidden'],
      ['invite/create', 403, 'suspended'],
      ['invite/create', 429, 'limit'],
      ['invite/create', 429, 'rate_limited', 30],
      ['invite/create', 503, 'disabled', 600],
      ['invite/create', 413, 'too_large'],
      ['invite/create', 404, 'not_found'],
    ]
    for (const [op, status, code, retryAfter] of cases) {
      server.refuseNext(op, status, code, retryAfter)
      const error = await refusal(() =>
        client.createInvite(space, {
          inviteId: toB64u(random(16)),
          joinVerifier: toB64u(random(32)),
          expiresAt: Date.now() + 60_000,
          epoch: 1,
        })
      )
      expect(isSpaceError(error, code as never), code).toBe(true)
      expect((error as SpaceError).status).toBe(status)
      if (retryAfter)
        expect((error as SpaceError).retryAfterMs).toBeGreaterThan(
          (retryAfter - 2) * 1000
        )
    }
  })

  it('tries a sync again once after a server failure, never a create', async () => {
    const space = await createSpace()
    server.state.log.length = 0
    server.refuseNext('sync', 500, 'internal')
    await client.sync(space, { since: 0 })
    expect(server.state.log).toEqual(['sync', 'sync'])

    server.state.log.length = 0
    server.refuseNext('create', 500, 'internal')
    const other = deriveSpaceMember(seed, newSpaceId(random))
    const error = await refusal(() =>
      client.create({
        spaceId: other.spaceId,
        memberId: other.memberId,
        dhPub: other.dhPub,
        tokenHash: other.tokenHash,
        wrap: toB64u(random(89)),
      })
    )
    expect(isSpaceError(error, 'unknown')).toBe(true)
    expect(server.state.log).toEqual(['create'])
  })

  it('sends each member’s key, and takes the server’s join time and their keys back', async () => {
    const spaceId = newSpaceId(random)
    const member = deriveSpaceMember(seed, spaceId)
    const before = Date.now()
    const created = await client.create({
      spaceId,
      memberId: member.memberId,
      dhPub: member.dhPub,
      tokenHash: member.tokenHash,
      wrap: toB64u(random(89)),
    })
    expect(created.seq).toBe(1)
    expect(created.joinedAt).toBeGreaterThanOrEqual(before)
    const page = await client.sync(
      { spaceId, memberId: member.memberId, token: member.token },
      { since: 0 }
    )
    expect(page.members).toEqual([
      {
        memberId: member.memberId,
        dhPub: member.dhPub,
        joinedAt: created.joinedAt,
      },
    ])
  })

  it('is refused a member id that doesn’t commit to its key', async () => {
    const spaceId = newSpaceId(random)
    const member = deriveSpaceMember(seed, spaceId)
    const other = deriveSpaceMember(random(32), spaceId)
    const error = await refusal(() =>
      client.create({
        spaceId,
        memberId: member.memberId,
        dhPub: other.dhPub,
        tokenHash: member.tokenHash,
        wrap: toB64u(random(89)),
      })
    )
    expect(isSpaceError(error, 'bad_request')).toBe(true)
  })

  it('opens an invite only at the current epoch', async () => {
    const space = await createSpace()
    const error = await refusal(() =>
      client.createInvite(space, {
        inviteId: toB64u(random(16)),
        joinVerifier: toB64u(random(32)),
        expiresAt: Date.now() + 60_000,
        epoch: 2,
      })
    )
    expect(isSpaceError(error, 'stale_key')).toBe(true)
  })

  it('gives every page of a catch-up the long timeout', async () => {
    vi.useFakeTimers()
    try {
      const space = await createSpace()
      await client.put(
        space,
        [1, 2, 3].map((n) => record(space, `r${n}`, n))
      )
      // Each answer takes longer than an ordinary call may (15 s).
      syncDelayMs = 20_000
      const pages: number[] = []
      const run = client.syncFrom(
        space,
        0,
        (page) => {
          pages.push(page.records.length)
        },
        { limit: 1 }
      )
      await vi.advanceTimersByTimeAsync(4 * 21_000)
      await run
      expect(pages).toEqual([1, 1, 1])
      // A sync that isn't catching up keeps the ordinary timeout (and tries
      // once more).
      const error = refusal(() => client.sync(space, { since: 3 }))
      await vi.advanceTimersByTimeAsync(60_000)
      expect(isSpaceError(await error, 'timeout')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens the live signal with the member in one header and the token alone in another', async () => {
    const space = await createSpace()
    const headers: Record<string, string>[] = []
    const { client: watched } = fakeSpacesClient(
      {
        ...server,
        openSocket: (url, sent) => {
          headers.push(sent)
          return server.openSocket(url, sent)
        },
      },
      { randomBytes: random, accountKey: seed }
    )
    const socket = await watched.openLive(space)
    socket.close()
    const [sent] = headers
    const named = JSON.parse(
      new TextDecoder().decode(fromB64u(sent['x-ww-space-auth']))
    ) as Record<string, unknown>
    expect(named).toEqual({ spaceId: space.spaceId, memberId: space.memberId })
    expect(sent['x-ww-space-token']).toBe(space.token)
    expect(JSON.stringify(named)).not.toContain(space.token)
  })

  it('reads Update Required as upgrade_required', async () => {
    const space = await createSpace()
    server.refuseNext('leave', 426, 'upgrade_required')
    const error = await refusal(() => client.leave(space))
    expect(isSpaceError(error, 'upgrade_required')).toBe(true)
  })
})

describe('back-pressure', () => {
  it('waits as the server asked, or its own floor', () => {
    expect(coolDownFor(new SpaceError('rate_limited', 429, 5000))).toBe(5000)
    expect(coolDownFor(new SpaceError('rate_limited', 429))).toBe(60_000)
    expect(coolDownFor(new SpaceError('disabled', 503, 1000))).toBe(15 * 60_000)
    expect(coolDownFor(new SpaceError('upgrade_required', 426))).toBe(
      15 * 60_000
    )
    expect(coolDownFor(new SpaceError('limit', 429))).toBeNull()
    expect(coolDownFor(new SpaceError('suspended', 403))).toBeNull()
  })

  it('holds automatic work until the wait ends', () => {
    let now = 1000
    const pressure = createBackPressure(() => now)
    pressure.note(new SpaceError('rate_limited', 429, 5000))
    expect(pressure.coolingDown()).toBe(true)
    now += 5001
    expect(pressure.coolingDown()).toBe(false)
  })
})
