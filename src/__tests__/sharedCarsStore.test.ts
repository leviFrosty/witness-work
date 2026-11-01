import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const saved = vi.hoisted(() => new Map<string, string>())

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', async () => {
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => void saved.set(key, value),
    removeItem: (key: string) => void saved.delete(key),
  }
  return {
    ...(await import('@/__tests__/mocks/mmkv')),
    MmkvStorage: storage,
    PersistStorage: storage,
  }
})
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useSharedCars from '@/stores/sharedCars'
import { sharedCar } from '@/lib/mileage/testing/sharedCars'
import type { Trip } from '@/types/mileage'

const NOW = new Date(2026, 9, 29, 9).getTime()

const trip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 'trip',
  vehicleId: 'mazda',
  date: '2026-10-29',
  distanceMiles: 12,
  createdAt: 1,
  ...overrides,
})

const car = () => useSharedCars.getState().cars.s1

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useSharedCars.setState(useSharedCars.getInitialState(), true)
  useSharedCars.getState().saveSharedCar(
    sharedCar('s1', {
      myMemberId: 'me',
      vehicles: [{ id: 'mazda', name: 'Mazda', createdAt: 1, updatedAt: 5 }],
    })
  )
  saved.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('shared cars store', () => {
  it('stamps updatedAt on every save and marks the record pending', () => {
    const { saveFuel } = useSharedCars.getState()
    saveFuel('s1', { id: 'gas', name: 'Gasoline', createdAt: 1 })
    const first = car().fuels[0].updatedAt!
    expect(first).toBeGreaterThanOrEqual(NOW)
    saveFuel('s1', { id: 'gas', name: 'Petrol', createdAt: 1 })

    expect(car().fuels).toEqual([
      expect.objectContaining({ name: 'Petrol', updatedAt: first + 1 }),
    ])
    expect(car().pendingPuts).toEqual(['gas'])
  })

  it('deletes a car with its setups and trips, leaving pending tombstones', () => {
    const state = useSharedCars.getState()
    state.saveVehicleSetup('s1', {
      id: 'setup',
      vehicleId: 'mazda',
      effectiveFrom: '2026-01-01',
      milesPerGallon: 30,
    })
    state.saveTrip('s1', trip())
    useSharedCars.getState().settlePendingPuts('s1', [
      { recordId: 'setup', stamp: car().vehicleSetups[0].updatedAt! },
      { recordId: 'trip', stamp: car().trips[0].updatedAt! },
    ])
    expect(car().pendingPuts).toEqual([])

    useSharedCars.getState().deleteVehicle('s1', 'mazda')

    expect(car()).toMatchObject({ vehicles: [], vehicleSetups: [], trips: [] })
    expect(car().deletedMileageRecords.map((t) => t.id)).toEqual([
      'mazda',
      'setup',
      'trip',
    ])
    expect([...car().pendingPuts].sort()).toEqual(['mazda', 'setup', 'trip'])
  })

  it('deletes a fuel with its prices', () => {
    const state = useSharedCars.getState()
    state.saveFuel('s1', { id: 'gas', name: 'Gasoline', createdAt: 1 })
    state.saveFuelPrice('s1', {
      id: 'price',
      fuelId: 'gas',
      effectiveFrom: '2026-01-01',
      pricePerGallon: 3,
    })
    useSharedCars.getState().deleteFuel('s1', 'gas')
    expect(car()).toMatchObject({ fuels: [], fuelPrices: [] })
    expect(car().deletedMileageRecords.map((t) => t.id)).toEqual([
      'gas',
      'price',
    ])
  })

  it('stamps a record added again past its tombstone, and drops it', () => {
    useSharedCars.getState().saveSharedCar({
      ...car(),
      deletedMileageRecords: [{ id: 'trip', deletedAt: NOW + 60_000 }],
    })
    useSharedCars.getState().saveTrip('s1', trip())
    expect(car().trips[0].updatedAt).toBeGreaterThan(NOW + 60_000)
    expect(car().deletedMileageRecords).toEqual([])
  })

  it('records who logged a trip, and who last edited it', () => {
    useSharedCars
      .getState()
      .saveTrip('s1', trip({ loggedBy: 'anna', editedBy: 'joe' }))
    expect(car().trips[0].loggedBy).toBe('me')
    expect(car().trips[0]).not.toHaveProperty('editedBy')

    useSharedCars.getState().saveSharedCar({
      ...car(),
      trips: [{ ...car().trips[0], loggedBy: 'anna' }],
    })
    useSharedCars
      .getState()
      .saveTrip('s1', trip({ distanceMiles: 20, loggedBy: undefined }))
    expect(car().trips[0]).toMatchObject({
      distanceMiles: 20,
      loggedBy: 'anna',
      editedBy: 'me',
    })
  })

  it('keeps who logged a trip moving here from another Shared Car', () => {
    useSharedCars.getState().saveSharedCar(
      sharedCar('s2', {
        myMemberId: 'me-2',
        vehicles: [{ id: 'van', name: 'Van', createdAt: 1 }],
        trips: [
          trip({ id: 'annas', vehicleId: 'van', loggedBy: 'anna-2' }),
          trip({ id: 'mine', vehicleId: 'van', loggedBy: 'me-2' }),
        ],
      })
    )

    useSharedCars
      .getState()
      .saveTrip('s1', trip({ id: 'annas', vehicleId: 'mazda' }))
    useSharedCars
      .getState()
      .saveTrip('s1', trip({ id: 'mine', vehicleId: 'mazda' }))

    const moved = (id: string) => car().trips.find((t) => t.id === id)
    expect(moved('annas')).toMatchObject({
      loggedBy: 'anna-2',
      editedBy: 'me',
    })

    expect(moved('mine')).toMatchObject({ loggedBy: 'me', editedBy: 'me' })
    expect(car().pendingPuts).toEqual(['annas', 'mine'])
  })

  it('leaves a car this device does not have alone', () => {
    const before = useSharedCars.getState()
    useSharedCars.getState().saveTrip('other', trip())
    useSharedCars.getState().deleteTrip('s1', 'missing')
    expect(useSharedCars.getState()).toBe(before)
  })

  it('keeps a pending mark when the record changed after it was sent', () => {
    const state = useSharedCars.getState()
    state.saveTrip('s1', trip())
    state.saveTrip('s1', trip({ id: 'other' }))
    const sentStamp = car().trips[0].updatedAt!
    useSharedCars.getState().saveTrip('s1', trip({ distanceMiles: 30 }))

    useSharedCars.getState().settlePendingPuts('s1', [
      { recordId: 'trip', stamp: sentStamp },
      { recordId: 'other', stamp: car().trips[1].updatedAt! },
    ])
    expect(car().pendingPuts).toEqual(['trip'])
  })

  it('settles a put of thousands of records in one pass', () => {
    const trips = Array.from({ length: 20_000 }, (_, n) =>
      trip({ id: `trip-${n}`, updatedAt: n + 1 })
    )
    useSharedCars
      .getState()
      .saveSharedCar(
        sharedCar('s1', { trips, pendingPuts: trips.map((t) => t.id) })
      )
    const started = performance.now()
    useSharedCars.getState().settlePendingPuts(
      's1',
      trips.map((t) => ({ recordId: t.id, stamp: t.updatedAt! }))
    )
    expect(car().pendingPuts).toEqual([])

    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('drops a leave it still owed once the User joins the car again', () => {
    const state = useSharedCars.getState()
    state.noteLeft('s1', 5)
    state.setPendingEnd('s1', 'leave')
    useSharedCars.getState().noteJoined('s1', 6)
    expect(useSharedCars.getState().pendingEnds).toEqual({})
    expect(useSharedCars.getState().memberships.cars.s1).toEqual({ at: 6 })
  })

  it('keeps a join’s mark until its answer is seen', () => {
    const joining = { spaceId: 's2', inviteId: 'i', epoch: 1, startedAt: 5 }
    useSharedCars.getState().saveJoining(joining)
    expect(useSharedCars.getState().joining).toEqual({ s2: joining })
    useSharedCars.getState().clearJoining('s2')
    expect(useSharedCars.getState().joining).toEqual({})
  })

  it('forgets a car', () => {
    useSharedCars.getState().removeSharedCar('s1')
    expect(useSharedCars.getState().cars).toEqual({})
  })

  it('keeps the invitations being closed until the server has heard', () => {
    const { addClosingInvite, clearClosingInvite } = useSharedCars.getState()
    addClosingInvite('s1', 'i1', {})

    addClosingInvite('s1', 'i1', { tag: 't' })
    addClosingInvite('s1', 'i2', { tag: 't' })
    expect(useSharedCars.getState().closingInvites).toEqual({
      s1: { i1: {}, i2: { tag: 't' } },
    })
    clearClosingInvite('s1', 'i1')
    expect(useSharedCars.getState().closingInvites).toEqual({
      s1: { i2: { tag: 't' } },
    })

    useSharedCars.getState().removeSharedCar('s1')
    expect(useSharedCars.getState().closingInvites).toEqual({})
  })

  it('forgets everything on reset', () => {
    useSharedCars.getState().addClosingInvite('s1', 'i1', {})
    useSharedCars.getState().noteJoined('s1', 5)
    useSharedCars.getState().reset()
    expect(useSharedCars.getState()).toMatchObject({
      cars: {},
      memberships: { cars: {}, leftCars: {} },
      seeding: {},
      pendingEnds: {},
      closingInvites: {},
    })
  })

  it('loads what an older build saved, with nothing being closed', async () => {
    saved.set(
      'sharedCars',
      JSON.stringify({
        state: {
          cars: {},
          memberships: { cars: {}, leftCars: {} },
          seeding: {},
          pendingEnds: {},
        },
        version: 0,
      })
    )
    await useSharedCars.persist.rehydrate()
    expect(useSharedCars.getState().closingInvites).toEqual({})
  })

  it('saves the cars and their bookkeeping, under its own key', async () => {
    useSharedCars.getState().saveTrip('s1', trip())
    const json = saved.get('sharedCars')!
    expect(JSON.parse(json)).toEqual({
      state: {
        cars: { s1: car() },
        memberships: { cars: {}, leftCars: {} },
        seeding: {},
        pendingEnds: {},
        joining: {},
        closingInvites: {},
      },
      version: 0,
    })

    useSharedCars.setState(useSharedCars.getInitialState(), true)
    saved.set('sharedCars', json)
    await useSharedCars.persist.rehydrate()
    expect(car().trips).toEqual([
      expect.objectContaining({ id: 'trip', loggedBy: 'me' }),
    ])
  })
})
