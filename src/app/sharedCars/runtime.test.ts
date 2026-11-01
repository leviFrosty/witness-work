import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({
  foreground: new Set<() => void>(),
  background: new Set<() => void>(),
  state: 'active',
}))

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return lifecycle.state
    },
  },
}))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: (listener: () => void) => {
    lifecycle.foreground.add(listener)
    return { remove: () => lifecycle.foreground.delete(listener) }
  },
  addBackgroundListener: (listener: () => void) => {
    lifecycle.background.add(listener)
    return { remove: () => lifecycle.background.delete(listener) }
  },
}))

import { SpaceError } from '@/lib/sharedSpaces/client'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import {
  createFakeSpacesServer,
  fakeSpacesClient,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import {
  GONE_RETRY_DELAYS_MS,
  type SharedCarsRuntimeDeps,
  startSharedCarsRuntime,
} from '@/app/sharedCars/runtime'
import {
  createHeadlessMember,
  type HeadlessMember,
} from '@/app/sharedCars/testing/headlessMember'

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

const eventually = (assertion: () => void) =>
  vi.waitFor(assertion, { timeout: 3000, interval: 5 })
const openSockets = (count: number, spaceId?: string) =>
  eventually(() => expect(server.openSockets(spaceId)).toBe(count))

let server: FakeSpacesServer
let stops: (() => void)[] = []

const toBackground = () => {
  lifecycle.state = 'background'
  for (const listener of lifecycle.background) listener()
}
const toForeground = () => {
  lifecycle.state = 'active'
  for (const listener of lifecycle.foreground) listener()
}

function person(name: string) {
  const seed = random(32)
  const { client } = fakeSpacesClient(server, {
    randomBytes: random,
    accountKey: seed,
  })
  return createHeadlessMember({ name, client, randomBytes: random, seed })
}

function run(
  member: HeadlessMember,
  extra: Pick<
    SharedCarsRuntimeDeps,
    'reconcileMemberships' | 'onMembershipsChanged' | 'watchProfile'
  > = {}
) {
  const stop = startSharedCarsRuntime({
    engine: member.engine,
    store: member.store,
    status: member.status,
    ready: () => true,
    watchReady: () => () => {},
    ...extra,
  })
  stops.push(stop)
  return stop
}

async function sharedPair() {
  const anna = person('Anna')
  const joe = person('Joe')
  anna.savePersonal('vehicles', { id: 'car-1', name: 'Mazda', createdAt: 1 })
  const { spaceId } = await anna.engine.shareCar('car-1')
  const invite = await anna.engine.createInvite(spaceId, {
    name: 'Joe',
    tag: memberTag(spaceId, joe.inboxId),
  })
  await joe.engine.joinCar(invite)
  return { anna, joe, spaceId }
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
  server = createFakeSpacesServer({ now: Date.now })
  lifecycle.state = 'active'
  lifecycle.foreground.clear()
  lifecycle.background.clear()
})

afterEach(() => {
  for (const stop of stops) stop()
  stops = []
  vi.restoreAllMocks()
})

describe('startSharedCarsRuntime', () => {
  it('keeps one live signal per car while in the foreground', async () => {
    const { joe } = await sharedPair()
    run(joe)
    await openSockets(1)
    expect(joe.status.getState().running).toBe(true)

    lifecycle.state = 'background'
    for (const listener of lifecycle.background) listener()
    expect(server.openSockets()).toBe(0)

    lifecycle.state = 'active'
    for (const listener of lifecycle.foreground) listener()
    await openSockets(1)
  })

  it('syncs when another device changes the car', async () => {
    const { anna, joe, spaceId } = await sharedPair()
    run(joe)
    await openSockets(1)
    anna.store.getState().saveTrip(spaceId, {
      id: 'trip-1',
      vehicleId: 'car-1',
      date: '2026-02-03',
      distanceMiles: 4,
      createdAt: 1,
    })
    await anna.engine.syncCar(spaceId)

    await eventually(() =>
      expect(joe.car(spaceId).trips.map((t) => t.id)).toEqual(['trip-1'])
    )
    expect(joe.status.getState().live[spaceId]?.status).toBe('open')
  })

  it('confirms a gone signal with a sync before ending the car', async () => {
    const { anna, joe, spaceId } = await sharedPair()
    run(joe)
    await openSockets(1)
    await anna.engine.removeMember(spaceId, joe.car(spaceId).myMemberId)
    await eventually(() => expect(joe.car(spaceId)).toBeUndefined())
    expect(joe.outcomes).toContainEqual({ type: 'ended', reason: 'gone' })
    expect(server.openSockets()).toBe(0)
  })

  it('brings the cars in line with the memberships first, and reports their changes', async () => {
    const { joe, spaceId } = await sharedPair()
    const calls: string[] = []
    const sync = vi.spyOn(joe.engine, 'sync')
    run(joe, {
      reconcileMemberships: () =>
        calls.push(`reconcile:${sync.mock.calls.length}`),
      onMembershipsChanged: () => calls.push('changed'),
    })

    expect(calls).toEqual(['reconcile:0'])
    await openSockets(1)

    joe.store.getState().saveTrip(spaceId, {
      id: 'trip-1',
      vehicleId: 'car-1',
      date: '2026-02-03',
      distanceMiles: 4,
      createdAt: 1,
    })
    expect(calls).toEqual(['reconcile:0'])
    await joe.engine.leaveCar(spaceId)
    expect(calls).toContain('changed')
  })

  it('syncs every car once a moment after the User’s profile changes', async () => {
    const anna = person('Anna')
    let changed: (() => void) | null = null
    const unwatch = vi.fn()
    const sync = vi.spyOn(anna.engine, 'sync')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const stop = run(anna, {
        watchProfile: (onChange) => {
          changed = onChange
          return unwatch
        },
      })
      expect(sync).toHaveBeenCalledTimes(1)
      changed!()
      await vi.advanceTimersByTimeAsync(1500)
      changed!()
      await vi.advanceTimersByTimeAsync(1999)
      expect(sync).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(sync).toHaveBeenCalledTimes(2)

      changed!()
      stop()
      expect(unwatch).toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2000)
      expect(sync).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('comes back after a gone signal when a sync finds the car still there', async () => {
    const { joe, spaceId } = await sharedPair()
    run(joe)
    await openSockets(1)

    server.closeLive(spaceId, 4001)
    expect(server.openSockets()).toBe(0)
    await openSockets(1)
    expect(joe.car(spaceId)).toBeDefined()
  })

  it('tries a sync that couldn’t confirm a gone signal again, then comes back', async () => {
    const { joe, spaceId } = await sharedPair()
    run(joe)
    await openSockets(1)
    const carGone = vi
      .spyOn(joe.engine, 'carGone')
      .mockRejectedValueOnce(new SpaceError('network'))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      server.closeLive(spaceId, 4001)
      await vi.advanceTimersByTimeAsync(100)
      expect(carGone).toHaveBeenCalledTimes(1)
      expect(server.openSockets()).toBe(0)
      await vi.advanceTimersByTimeAsync(GONE_RETRY_DELAYS_MS[0])
      expect(carGone).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
    await openSockets(1)
    expect(joe.car(spaceId)).toBeDefined()
  })

  it('keeps one socket through quick trips to the background and back', async () => {
    const { joe } = await sharedPair()
    run(joe)
    await openSockets(1)
    for (let trip = 0; trip < 5; trip++) {
      toBackground()
      toForeground()
    }
    await openSockets(1)
    await settle()
    expect(server.openSockets()).toBe(1)
    toBackground()
    await openSockets(0)
  })

  it('closes the sockets Android opens after they were closed', async () => {
    server = createFakeSpacesServer({ now: Date.now, androidSockets: true })
    const { joe } = await sharedPair()
    run(joe)

    toBackground()
    toForeground()
    toBackground()
    toForeground()
    await openSockets(1)
    await settle()
    expect(server.openSockets()).toBe(1)
  })

  it('gets through a refused handshake, syncing before it tries again', async () => {
    const { joe, spaceId } = await sharedPair()
    server.refuseNextSocket(401)
    const sync = vi.spyOn(joe.engine, 'syncCar')
    run(joe)
    await settle()
    expect(server.openSockets()).toBe(0)

    await openSockets(1)
    expect(sync).toHaveBeenCalledWith(spaceId, expect.anything())
    expect(joe.status.getState().live[spaceId]?.status).toBe('open')
  })

  it('waits a minute after the server replaced its socket, so devices don’t take turns', async () => {
    server = createFakeSpacesServer({ now: Date.now, maxMembers: 1 })
    const anna = person('Anna')
    anna.savePersonal('vehicles', { id: 'car-1', name: 'Mazda', createdAt: 1 })
    const { spaceId } = await anna.engine.shareCar('car-1')

    const devices = [anna]
    for (let n = 1; n < 5; n++) {
      const device = createHeadlessMember({
        name: 'Anna',
        client: fakeSpacesClient(server, {
          randomBytes: random,
          accountKey: anna.seed,
        }).client,
        randomBytes: random,
        seed: anna.seed,
      })
      await device.engine.addCarFromRoster(
        spaceId,
        anna.store.getState().memberships.cars[spaceId].at
      )
      devices.push(device)
    }
    for (const device of devices) {
      run(device)
      await eventually(() =>
        expect(device.status.getState().live[spaceId]?.status).toBe('open')
      )
    }
    expect(server.openSockets(spaceId)).toBe(4)
    const replaced = devices.filter(
      (device) => device.status.getState().live[spaceId]?.status !== 'open'
    )
    expect(replaced).toHaveLength(1)
    const [{ status }] = replaced
    const log = status.getState().live[spaceId]!.log.map((entry) => entry.event)
    expect(log).toContainEqual(
      expect.objectContaining({ type: 'closed', code: 4002 })
    )
    const wait = log.findLast((event) => event.type === 'reconnectScheduled')
    expect(wait).toMatchObject({ inMs: expect.any(Number) })
    expect((wait as { inMs: number }).inMs).toBeGreaterThanOrEqual(60_000)
    await settle()
    expect(server.openSockets(spaceId)).toBe(4)
  })

  it('stops everything when it stops', async () => {
    const { joe } = await sharedPair()
    const stop = run(joe)
    await openSockets(1)
    stop()
    expect(server.openSockets()).toBe(0)
    expect(joe.status.getState().running).toBe(false)
    expect(lifecycle.foreground.size).toBe(0)
  })
})
