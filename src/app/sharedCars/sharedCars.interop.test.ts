import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import type { LiveSocket } from '@/lib/liveSignal'
import { interopSessions } from '@/lib/serverAccount/testing/interopSessions'
import {
  createSpacesClient,
  isSpaceError,
  type SpaceMemberAuth,
} from '@/lib/sharedSpaces/client'
import {
  deriveSpaceMember,
  joinVerifier,
  memberTag,
  newSpaceId,
  wrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import { SPACE_CLOSE_GONE } from '@/lib/sharedSpaces/live'
import { createHeadlessMember } from '@/app/sharedCars/testing/headlessMember'
import { runSharedCarLifecycle } from '@/app/sharedCars/testing/lifecycleScenario'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

const spacesUrl = process.env.SHARED_SPACES_URL
const devBypass =
  process.env.ACCOUNTS_DEV_BYPASS ?? process.env.EXPO_PUBLIC_API_DEV_BYPASS
const adminToken = process.env.ACCOUNTS_ADMIN_TOKEN
const enabled = Boolean(spacesUrl && devBypass)

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

function account(seed: Uint8Array = random(32)) {
  const sessions = interopSessions(random, seed, spacesUrl!)
  const client = createSpacesClient({
    baseUrl: spacesUrl!,
    authorize: (run, { signal }) =>
      sessions.withSession(run, { accountKey: seed, signal }),

    openSocket: (url, headers) =>
      new WebSocket(url, { headers } as never) as unknown as LiveSocket,
  })
  return { seed, sessions, client }
}

const clientFor = (seed: Uint8Array) => account(seed).client

function person(name: string, seed: Uint8Array = random(32)) {
  return createHeadlessMember({
    name,
    client: clientFor(seed),
    randomBytes: random,
    seed,
  })
}

type Person = ReturnType<typeof person>

const authOf = (who: Person, spaceId: string): SpaceMemberAuth => {
  const member = deriveSpaceMember(who.seed, spaceId)
  return { spaceId, memberId: member.memberId, token: member.token }
}

async function sharedCar(owner: Person, ...others: Person[]) {
  owner.savePersonal('vehicles', {
    id: crypto.randomUUID(),
    name: 'Interop car',
    createdAt: Date.now(),
  })
  const [car] = owner.personal().vehicles
  owner.savePersonal('trips', {
    id: crypto.randomUUID(),
    vehicleId: car.id,
    date: '2026-02-03',
    distanceMiles: 3,
    createdAt: Date.now(),
  })
  const { spaceId } = await owner.engine.shareCar(car.id)
  for (const other of others)
    await other.engine.joinCar(
      await owner.engine.createInvite(spaceId, {
        name: other.name,
        tag: memberTag(spaceId, other.inboxId),
      })
    )
  await owner.engine.syncCar(spaceId)
  return spaceId
}

const refusal = (run: Promise<unknown>) =>
  run.then(
    () => null,
    (error: unknown) => (isSpaceError(error) ? error.code : String(error))
  )

function listen(socket: LiveSocket) {
  const messages: { type?: string; seq?: number }[] = []
  let closed: number | null = null
  let opened = false
  const waiters = new Set<() => void>()
  const wake = () => {
    for (const waiter of waiters) waiter()
  }
  socket.onopen = () => {
    opened = true
    wake()
  }
  socket.onmessage = ({ data }) => {
    if (typeof data === 'string' && data !== 'pong')
      messages.push(JSON.parse(data) as { type?: string; seq?: number })
    wake()
  }
  socket.onclose = ({ code }) => {
    closed = code ?? 0
    wake()
  }
  const until = (check: () => boolean, ms = 10_000) =>
    new Promise<void>((resolve, reject) => {
      if (check()) return resolve()
      const timer = setTimeout(() => {
        waiters.delete(waiter)
        reject(new Error('Timed out waiting for the live socket'))
      }, ms)
      const waiter = () => {
        if (!check()) return
        clearTimeout(timer)
        waiters.delete(waiter)
        resolve()
      }
      waiters.add(waiter)
    })
  return {
    messages,
    until,
    opened: () => opened,
    closed: () => closed,
  }
}

describe.skipIf(!enabled)('shared cars interop', () => {
  it(
    'runs a car from sharing to the last one left',
    () =>
      runSharedCarLifecycle({
        person: (name) => person(name),
        device: (of) => person(of.name, of.seed),
        spaceGone: async (spaceId, member) => {
          const error = await clientFor(member.seed)
            .sync(deriveSpaceMember(member.seed, spaceId), { since: 0 })
            .then(
              () => null,
              (failure: unknown) => failure
            )
          return isSpaceError(error, 'gone')
        },
      }),
    120_000
  )

  it('signals over the live socket: hello, changed, and gone', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const socket = await clientFor(joe.seed).openLive(authOf(joe, spaceId))
    const live = listen(socket)
    await live.until(() => live.messages.some((m) => m.type === 'hello'))
    const hello = live.messages.find((m) => m.type === 'hello')!
    expect(hello.seq).toBeGreaterThan(0)

    const [trip] = anna.car(spaceId).trips
    anna.store.getState().saveTrip(spaceId, { ...trip, note: 'Live' })
    await anna.engine.syncCar(spaceId)
    await live.until(() =>
      live.messages.some((m) => m.type === 'changed' && m.seq! > hello.seq!)
    )

    await anna.engine.removeMember(spaceId, authOf(joe, spaceId).memberId)

    await live.until(() => live.closed() !== null, 30_000)
    expect(live.closed()).toBe(SPACE_CLOSE_GONE)
  }, 60_000)

  it('refuses a live socket whose token isn’t the member’s', async () => {
    const anna = person('Anna')
    const spaceId = await sharedCar(anna)
    const socket = await clientFor(anna.seed).openLive({
      ...authOf(anna, spaceId),
      token: toB64u(random(32)),
    })
    const live = listen(socket)
    await live.until(() => live.closed() !== null)
    expect(live.opened() && live.messages.length > 0).toBe(false)
  }, 60_000)

  it('refuses a member id that doesn’t commit to its key, on create and join', async () => {
    const { client, seed } = account()
    const spaceId = newSpaceId(random)
    const member = deriveSpaceMember(seed, spaceId)
    const someone = deriveSpaceMember(random(32), spaceId)
    const wrap = (to: string) =>
      wrapSpaceKey(
        random(32),
        to,
        { spaceId, epoch: 1, memberId: member.memberId },
        { ephemeral: random(32), nonce: random(24) }
      )
    expect(
      await refusal(
        client.create({
          spaceId,
          memberId: member.memberId,
          dhPub: someone.dhPub,
          tokenHash: member.tokenHash,
          wrap: wrap(someone.dhPub),
        })
      )
    ).toBe('bad_request')

    const anna = person('Anna')
    const joinable = await sharedCar(anna)
    const joiner = account()
    const self = deriveSpaceMember(joiner.seed, joinable)
    const secret = random(32)
    const inviteId = toB64u(random(16))
    await clientFor(anna.seed).createInvite(authOf(anna, joinable), {
      inviteId,
      joinVerifier: joinVerifier(secret),
      expiresAt: Date.now() + 60 * 60 * 1000,
      epoch: 1,
    })
    expect(
      await refusal(
        joiner.client.join({
          spaceId: joinable,
          inviteId,
          joinSecret: toB64u(secret),
          epoch: 1,
          memberId: self.memberId,
          dhPub: someone.dhPub,
          tokenHash: self.tokenHash,
          wrap: wrap(someone.dhPub),
        })
      )
    ).toBe('bad_request')
  }, 60_000)

  it('opens an invite only at the current epoch', async () => {
    const anna = person('Anna')
    const spaceId = await sharedCar(anna)
    expect(
      await refusal(
        clientFor(anna.seed).createInvite(authOf(anna, spaceId), {
          inviteId: toB64u(random(16)),
          joinVerifier: joinVerifier(random(32)),
          expiresAt: Date.now() + 60 * 60 * 1000,
          epoch: 2,
        })
      )
    ).toBe('stale_key')
  }, 60_000)

  it('closes the invitations someone made when they leave, so they can’t rejoin through one', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const cal = person('Cal')
    const spaceId = await sharedCar(anna, joe, cal)

    const own = await joe.engine.createInvite(spaceId, {
      name: 'Joe',
      tag: memberTag(spaceId, joe.inboxId),
    })
    expect(await joe.engine.leaveCar(spaceId)).toEqual({ pending: false })
    await expect(joe.engine.joinCar(own)).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(joe.car(spaceId)).toBeUndefined()
    expect(joe.store.getState().joining).toEqual({})
  }, 60_000)

  it('counts a join by someone already on the car as joined', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    const spaceId = await sharedCar(anna, joe)
    const joesIpad = person('Joe', joe.seed)
    await joesIpad.engine.joinCar(
      await anna.engine.createInvite(spaceId, {
        name: 'Joe',
        tag: memberTag(spaceId, joe.inboxId),
      })
    )
    expect(joesIpad.car(spaceId).trips).toHaveLength(1)
  }, 60_000)

  it.skipIf(!adminToken)(
    'keeps changes made while the account is suspended, and puts them once it isn’t',
    async () => {
      const anna = person('Anna')
      const joe = person('Joe')
      const spaceId = await sharedCar(anna, joe)
      const { accountId } = await account(joe.seed).sessions.ensure(joe.seed)
      const setStatus = async (status: 'suspended' | 'active') => {
        const response = await fetch(`${spacesUrl}/admin/accounts/status`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-ww-admin-token': adminToken!,
          },
          body: JSON.stringify({ accountId, status, reason: 'report' }),
        })
        expect(response.ok).toBe(true)
      }
      await setStatus('suspended')
      try {
        const [trip] = joe.car(spaceId).trips
        joe.store.getState().saveTrip(spaceId, { ...trip, note: 'Held' })
        expect(await joe.engine.syncCar(spaceId)).toBe('synced')
        expect(joe.status.getState().suspended).toBe(true)
        expect(joe.car(spaceId).pendingPuts).toEqual([trip.id])
      } finally {
        await setStatus('active')
      }

      await joe.relaunch()
      expect(await joe.engine.syncCar(spaceId)).toBe('synced')
      expect(joe.car(spaceId).pendingPuts).toEqual([])
      await anna.engine.syncCar(spaceId)
      expect(anna.car(spaceId).trips[0].note).toBe('Held')
    },
    60_000
  )
})
