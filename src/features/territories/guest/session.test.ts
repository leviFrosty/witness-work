import { randomBytes as nodeRandomBytes, randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGuestSpacesClient } from '@/lib/sharedSpaces/client'
import { inScopeRecordId, workedRecordId } from '@/lib/sharedSpaces/records'
import { parseGuestLinkFragment } from '@/lib/sharedSpaces/scopes'
import {
  createFakeSpacesServer,
  FAKE_SPACES_URL,
  fakeSpacesClient,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import { doorData, readDoor } from '@/features/territories/guest/codecs'
import {
  createGuestSession,
  type GuestSession,
} from '@/features/territories/guest/session'
import {
  createGuestLinkStore,
  GUEST_CURRENT_KEY,
  GUEST_STORE_PREFIX,
  type GuestStorage,
} from '@/features/territories/guest/store'
import {
  createGuestLinkSpace,
  type GuestLinkSpace,
  putOwnerDoor,
} from '@/features/territories/guest/testing/guestLinkSpace'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const HOUR = 60 * 60 * 1000

function memoryStorage(): GuestStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
}

let clock: number
let skew: number
let server: FakeSpacesServer
let owner: ReturnType<typeof fakeSpacesClient>
let storage: ReturnType<typeof memoryStorage>
let requests: { url: string; body: string }[]

const deps = () => ({
  client: owner.client,
  seed: owner.accountKey,
  randomBytes: random,
  randomUUID,
  now: () => clock,
})

const linkSpace = (
  options: Partial<Parameters<typeof createGuestLinkSpace>[1]> = {}
) =>
  createGuestLinkSpace(deps(), {
    streets: [
      {
        name: 'Oak Street',
        doors: [{ label: '2', outcome: 'notHome' }],
        doNotCalls: [{ address: '8 Oak Street', label: '8' }],
      },
      { name: 'Elm Street', numbering: 'odd' },
      { name: 'Pine Street' },
    ],
    linkStreets: [0, 1],
    ...options,
  })

function guestFor(space: GuestLinkSpace): GuestSession {
  const link = parseGuestLinkFragment(space.fragment)
  if (!link) throw new Error('bad fragment')
  return createGuestSession({
    link,
    client: createGuestSpacesClient({
      baseUrl: FAKE_SPACES_URL,
      fetchImpl: (async (url: string, init?: RequestInit) => {
        requests.push({ url: String(url), body: String(init?.body ?? '') })
        return server.fetchImpl(url, init)
      }) as typeof fetch,
    }),
    store: createGuestLinkStore(storage),
    now: () => clock + skew,
    randomBytes: random,
    randomUUID,
  })
}

const kinds = (session: GuestSession) =>
  [...session.getState().records.values()]
    .filter((record) => !record.deleted)
    .map((record) => record.kind)
    .sort()

beforeEach(() => {
  clock = Date.now()
  skew = 0
  server = createFakeSpacesServer({ now: () => clock })
  owner = fakeSpacesClient(server, { randomBytes: random })
  storage = memoryStorage()
  requests = []
})

describe('guest session', () => {
  it('opens the link, reads only its streets, and keeps the secret out of every request', async () => {
    const space = await linkSpace()
    const session = guestFor(space)
    await session.start()
    const state = session.getState()
    expect(state.status).toBe('ready')
    expect(state.keys?.title).toBe('Territory 12 · North Hill')
    expect(state.keys?.from).toBe('Anna')
    expect(Object.keys(state.keys?.scopes ?? {}).sort()).toEqual(
      [...space.scopes].sort()
    )
    expect(kinds(session)).toEqual(['doNotCall', 'door', 'street', 'street'])
    const secret = space.fragment.split('.')[3]
    for (const request of requests) {
      expect(request.url).not.toContain(secret)
      expect(request.body).not.toContain(secret)
      expect(request.url).not.toContain(space.linkId)
    }
    expect(storage.map.get(GUEST_CURRENT_KEY)).toBe(space.linkId)
  })

  it('names the guest once in the first scope, then records doors under the scope key', async () => {
    const space = await linkSpace()
    const session = guestFor(space)
    await session.start()
    session.setName('  Maria ')
    await session.sync()
    const guest = session.getState().guest
    expect(guest?.name).toBe('Maria')
    const first = [...space.scopes].sort()[0] as string
    expect(
      session.getState().records.get(inScopeRecordId(first, guest!.id))?.kind
    ).toBe('guest')

    const doorId = randomUUID()
    const recordId = inScopeRecordId(space.scopes[0] as string, doorId)
    session.write([
      {
        recordId,
        kind: 'door',
        data: doorData({
          label: '4',
          outcome: 'spoke',
          at: clock,
          tries: 1,
          by: guest!.id,
          byName: guest!.name,
        }),
      },
    ])
    expect(session.getState().queued).toBe(1)
    await session.sync()
    expect(session.getState().queued).toBe(0)

    const ownerView = await owner.client.sync(space.auth, { since: 0 })
    expect(ownerView.records.map((r) => r.recordId)).toContain(recordId)
  })

  it('sees another person’s record on the next sync', async () => {
    const space = await linkSpace()
    const session = guestFor(space)
    await session.start()
    const recordId = await putOwnerDoor(deps(), space, {
      label: '6',
      byName: 'Joe',
    })
    await session.sync()
    const record = session.getState().records.get(recordId)
    expect(readDoor(record!.data!)).toMatchObject({
      label: '6',
      byName: 'Joe',
    })
  })

  it('keeps records while offline and sends them once back online', async () => {
    const space = await linkSpace()
    const session = guestFor(space)
    await session.start()
    const fetchFail = vi
      .spyOn(server, 'fetchImpl')
      .mockRejectedValue(new TypeError('Failed to fetch'))
    session.write([
      {
        recordId: workedRecordId(space.scopes[0] as string),
        kind: 'worked',
        data: { at: clock, by: randomUUID() },
      },
    ])
    await session.sync()
    expect(session.getState()).toMatchObject({ offline: true, queued: 1 })
    expect(session.getState().status).toBe('ready')
    fetchFail.mockRestore()
    await session.sync()
    expect(session.getState()).toMatchObject({ offline: false, queued: 0 })
  })

  it('shows the cached link right away on a reload', async () => {
    const space = await linkSpace()
    await guestFor(space).start()
    const again = guestFor(space)
    const started = again.start()
    expect(again.getState().status).toBe('ready')
    await started
  })

  it('shows the saved records before it starts, then asks only for what changed', async () => {
    const space = await linkSpace()
    const first = guestFor(space)
    await first.start()
    const saved = kinds(first)
    expect(saved.length).toBeGreaterThan(0)
    requests = []

    const again = guestFor(space)
    expect(again.getState().status).toBe('ready')
    expect(kinds(again)).toEqual(saved)
    expect(requests).toEqual([])

    await again.start()
    expect(requests).toHaveLength(1)
    const { since } = JSON.parse(requests[0].body) as { since: number }
    expect(since).toBeGreaterThan(0)
    expect(kinds(again)).toEqual(saved)
  })

  it('doesn’t show a saved link that has since expired', async () => {
    const space = await linkSpace()
    await guestFor(space).start()
    clock += 25 * HOUR
    expect(guestFor(space).getState().status).toBe('loading')
  })

  it('stamps with the server’s clock when the device’s is off', async () => {
    const space = await linkSpace()
    const session = guestFor(space)
    skew = -2 * HOUR
    await session.start()
    expect(Math.abs(session.corrected() - clock)).toBeLessThan(1500)
  })

  it('ends and forgets everything when the link is ended, counting what wasn’t sent', async () => {
    const space = await linkSpace()
    const session = guestFor(space)
    await session.start()
    await owner.client.endLink(space.auth, space.linkId)
    session.write([
      {
        recordId: workedRecordId(space.scopes[0] as string),
        kind: 'worked',
        data: { at: clock, by: randomUUID() },
      },
    ])
    await session.sync()
    expect(session.getState()).toMatchObject({
      status: 'ended',
      lost: 1,
      keys: null,
    })
    expect(
      [...storage.map.keys()].filter((key) =>
        key.startsWith(GUEST_STORE_PREFIX)
      )
    ).toEqual([])
  })

  it('says expired once the link is past its end', async () => {
    const space = await linkSpace({ lifetimeMs: HOUR })
    const session = guestFor(space)
    await session.start()
    clock += 2 * HOUR
    session.checkExpiry()
    expect(session.getState().status).toBe('expired')
    expect(storage.map.size).toBe(0)
  })

  it('reads expired from the server too', async () => {
    const space = await linkSpace({ lifetimeMs: HOUR })
    const session = guestFor(space)
    clock += 2 * HOUR
    await session.start()
    expect(session.getState().status).toBe('expired')
  })

  it('says invalid for a link the server doesn’t know', async () => {
    const space = await linkSpace()
    const wrong = {
      ...space,
      fragment: space.fragment.replace(
        /\.[^.]+$/,
        `.${Buffer.from(random(32)).toString('base64url')}`
      ),
    }
    const session = guestFor(wrong)
    await session.start()
    expect(session.getState().status).toBe('invalid')
  })

  it('pauses while guest links are switched off, then resumes', async () => {
    const space = await linkSpace()
    const session = guestFor(space)
    server.state.guests = false
    await session.start()
    expect(session.getState().status).toBe('paused')
    server.state.guests = true
    clock += 2 * 60_000
    await session.sync()
    expect(session.getState().status).toBe('ready')
  })

  it('drops records for a street that was handed off, and says so', async () => {
    const space = await linkSpace()
    const session = guestFor(space)
    await session.start()
    server.refuseNext('guest/put', 403, 'forbidden')
    session.write([
      {
        recordId: workedRecordId(space.scopes[0] as string),
        kind: 'worked',
        data: { at: clock, by: randomUUID() },
      },
    ])
    await session.sync()
    expect(session.getState()).toMatchObject({ queued: 0, refused: 1 })
  })

  it('re-reads its keys and re-sends after stale_key', async () => {
    const space = await linkSpace()
    const session = guestFor(space)
    await session.start()
    server.refuseNext('guest/put', 409, 'stale_key')
    session.write([
      {
        recordId: workedRecordId(space.scopes[0] as string),
        kind: 'worked',
        data: { at: clock, by: randomUUID() },
      },
    ])
    await session.sync()
    expect(session.getState().queued).toBe(0)
  })

  it('forgets the link on request', async () => {
    const space = await linkSpace()
    const session = guestFor(space)
    await session.start()
    session.forget()
    expect(session.getState().status).toBe('forgotten')
    expect(storage.map.size).toBe(0)
  })
})
