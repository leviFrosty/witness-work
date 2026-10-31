import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import { getMileageView } from '@/stores/mileageView'
import * as writes from '@/stores/mileageWrites'
import { sharedCar } from '@/lib/mileage/testing/sharedCars'
import type { Trip } from '@/types/mileage'

const {
  deleteAllMileageData,
  deleteFuel,
  deleteFuelPrice,
  deleteTrip,
  deleteVehicle,
  deleteVehicleSetup,
  saveFuel,
  saveFuelPrice,
  saveTrip,
  saveVehicle,
  saveVehicleSetup,
} = writes

/**
 * The writes the seam shares with the User's own store, whatever each returns
 * (the seam's `saveTrip` says whether it saved).
 */
type Writes = {
  [K in keyof Omit<typeof writes, 'deleteAllMileageData'>]: (
    ...args: Parameters<(typeof writes)[K]>
  ) => unknown
}

const NOW = new Date(2026, 9, 29, 9).getTime()

const trip = (id: string, vehicleId: string, distanceMiles = 10): Trip => ({
  id,
  vehicleId,
  date: '2026-10-01',
  distanceMiles,
  createdAt: 1,
})

const own = () => useMileage.getState()
const shared = () => useSharedCars.getState().cars.s1
const ids = (records: { id: string }[]) => records.map((r) => r.id)
const tombstoneIds = (state: { deletedMileageRecords: { id: string }[] }) =>
  ids(state.deletedMileageRecords).sort()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useMileage.getState()._WARNING_forceDeleteMileage()
  useSharedCars.setState(useSharedCars.getInitialState(), true)
  useMileage.setState({
    vehicles: [{ id: 'civic', name: 'Civic', createdAt: 1, updatedAt: 1 }],
    fuels: [{ id: 'gas', name: 'Gasoline', createdAt: 1, updatedAt: 1 }],
    trips: [{ ...trip('mine', 'civic'), updatedAt: 1 }],
  })
  useSharedCars.getState().saveSharedCar(
    sharedCar('s1', {
      myMemberId: 'me',
      vehicles: [{ id: 'mazda', name: 'Mazda', createdAt: 1, updatedAt: 1 }],
      fuels: [{ id: 'gas-copy', name: 'Gasoline', createdAt: 1, updatedAt: 1 }],
      fuelPrices: [
        {
          id: 'price-copy',
          fuelId: 'gas-copy',
          effectiveFrom: '2026-01-01',
          pricePerGallon: 5,
          updatedAt: 1,
        },
      ],
      vehicleSetups: [
        {
          id: 'setup-copy',
          vehicleId: 'mazda',
          effectiveFrom: '2026-01-01',
          fuelId: 'gas-copy',
          updatedAt: 1,
        },
      ],
      trips: [{ ...trip('ours', 'mazda'), loggedBy: 'anna', updatedAt: 1 }],
    })
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('mileage writes', () => {
  it("writes exactly as the User's own store does, with no Shared Cars", () => {
    const everyWrite = (api: Writes) => {
      api.saveVehicle({ id: 'truck', name: 'Truck', createdAt: 2 })
      api.saveFuel({ id: 'diesel', name: 'Diesel', createdAt: 2 })
      api.saveFuelPrice({
        id: 'diesel-price',
        fuelId: 'diesel',
        effectiveFrom: '2026-01-01',
        pricePerGallon: 4,
      })
      api.saveVehicleSetup({
        id: 'truck-setup',
        vehicleId: 'truck',
        effectiveFrom: '2026-01-01',
        fuelId: 'diesel',
      })
      api.saveTrip(trip('haul', 'truck'))
      api.saveTrip({ ...trip('mine', 'civic', 20), updatedAt: 1 })
      api.saveVehicle({
        id: 'civic',
        name: 'Civic',
        archived: true,
        createdAt: 1,
      })
      api.deleteFuelPrice('diesel-price')
      api.deleteVehicleSetup('truck-setup')
      api.deleteTrip('haul')
      api.deleteFuel('gas')
      api.deleteVehicle('truck')
      api.deleteTrip('missing')
    }
    const stores = () => {
      const { set: _set, ...state } = useMileage.getState()
      return JSON.parse(
        JSON.stringify({ own: state, shared: useSharedCars.getState().cars })
      )
    }
    const ownOnly = { ...own() }

    useSharedCars.setState(useSharedCars.getInitialState(), true)
    everyWrite(useMileage.getState())
    const direct = stores()

    useMileage.setState(ownOnly)
    everyWrite(writes)
    expect(stores()).toEqual(direct)
    expect(direct.shared).toEqual({})
    expect(ids(direct.own.vehicles)).toEqual(['civic'])
  })

  it('saves a trip on a Shared Car to its space, logged by the User', () => {
    const ownChanges = vi.fn()
    const stop = useMileage.subscribe(ownChanges)
    saveTrip({ ...trip('new', 'mazda'), loggedBy: 'someone' })
    stop()

    expect(shared().trips.find((t) => t.id === 'new')).toEqual({
      ...trip('new', 'mazda'),
      loggedBy: 'me',
      updatedAt: NOW,
    })
    expect(shared().pendingPuts).toEqual(['new'])
    expect(ownChanges).not.toHaveBeenCalled()
  })

  it("records who edited a Shared Car's trip, keeping who logged it", () => {
    const viewed = getMileageView().trips.find((t) => t.id === 'ours')!
    saveTrip({ ...viewed, distanceMiles: 25 })
    expect(shared().trips[0]).toMatchObject({
      distanceMiles: 25,
      loggedBy: 'anna',
      editedBy: 'me',
    })
    expect(shared().trips[0].updatedAt).toBeGreaterThan(1)
  })

  it("saves setups, fuels, and prices to their car's store", () => {
    saveVehicleSetup({
      id: 'setup-2',
      vehicleId: 'mazda',
      effectiveFrom: '2026-06-01',
      fuelId: 'gas-copy',
    })
    saveFuelPrice({
      id: 'price-2',
      fuelId: 'gas-copy',
      effectiveFrom: '2026-06-01',
      pricePerGallon: 6,
    })
    // A fuel made in a Shared Car's form belongs to that car.
    saveFuel(
      { id: 'ev', name: 'Electric', createdAt: 2 },
      { vehicleId: 'mazda' }
    )
    saveFuelPrice({
      id: 'ev-price',
      fuelId: 'ev',
      effectiveFrom: '2026-06-01',
      pricePerGallon: 1,
    })
    // Any other new fuel, and the User's own fuels, stay theirs.
    saveFuel({ id: 'diesel', name: 'Diesel', createdAt: 2 })
    saveFuel(
      { id: 'gas', name: 'Petrol', createdAt: 1 },
      { vehicleId: 'mazda' }
    )
    saveFuel({ id: 'gas-copy', name: 'Unleaded', createdAt: 1 })

    expect(ids(shared().vehicleSetups)).toEqual(['setup-copy', 'setup-2'])
    expect(ids(shared().fuelPrices)).toEqual([
      'price-copy',
      'price-2',
      'ev-price',
    ])
    expect(shared().fuels.map((f) => f.name)).toEqual(['Unleaded', 'Electric'])
    expect(own().fuels.map((f) => f.name)).toEqual(['Petrol', 'Diesel'])
    expect(own().vehicleSetups).toEqual([])
    expect(own().fuelPrices).toEqual([])
    expect([...shared().pendingPuts].sort()).toEqual([
      'ev',
      'ev-price',
      'gas-copy',
      'price-2',
      'setup-2',
    ])
  })

  it("saves a Shared Car without the view's mark of its space", () => {
    const viewed = getMileageView().vehicles.find((v) => v.id === 'mazda')!
    expect(viewed.spaceId).toBe('s1')
    saveVehicle({ ...viewed, archived: true })
    expect(shared().vehicles).toEqual([
      {
        id: 'mazda',
        name: 'Mazda',
        archived: true,
        createdAt: 1,
        updatedAt: NOW,
      },
    ])
    expect(shared().pendingPuts).toEqual(['mazda'])

    saveVehicle({ id: 'truck', name: 'Truck', createdAt: 2 })
    expect(ids(own().vehicles)).toEqual(['civic', 'truck'])
  })

  it('moves a trip given a car in the other store', () => {
    saveTrip({ ...trip('mine', 'mazda'), updatedAt: 1 })
    expect(ids(own().trips)).toEqual([])
    expect(tombstoneIds(own())).toEqual(['mine'])
    expect(shared().trips.find((t) => t.id === 'mine')).toMatchObject({
      vehicleId: 'mazda',
      loggedBy: 'me',
    })
    expect(getMileageView().trips.filter((t) => t.id === 'mine')).toHaveLength(
      1
    )

    const viewed = getMileageView().trips.find((t) => t.id === 'mine')!
    saveTrip({ ...viewed, vehicleId: 'civic' })
    expect(ids(shared().trips)).toEqual(['ours'])
    expect(tombstoneIds(shared())).toEqual(['mine'])
    expect(shared().pendingPuts).toContain('mine')
    expect(own().trips).toEqual([
      expect.objectContaining({ id: 'mine', vehicleId: 'civic' }),
    ])
    expect(own().trips[0]).not.toHaveProperty('loggedBy')
    expect(own().trips[0]).not.toHaveProperty('editedBy')
    expect(getMileageView().trips.map((t) => t.id)).toEqual(['mine', 'ours'])
  })

  it("deletes a trip wherever it's live, a hidden copy included", () => {
    // The User's own stale copy of the Shared Car's trip, which it hides.
    useMileage.setState({
      trips: [...own().trips, { ...trip('ours', 'mazda', 1), updatedAt: 2 }],
    })
    deleteTrip('ours')

    expect(shared().trips).toEqual([])
    expect(tombstoneIds(shared())).toEqual(['ours'])
    expect(shared().pendingPuts).toEqual(['ours'])
    expect(ids(own().trips)).toEqual(['mine'])
    expect(tombstoneIds(own())).toEqual(['ours'])
    expect(ids(getMileageView().trips)).toEqual(['mine'])
  })

  it('leaves a store alone when it has nothing to delete', () => {
    const ownChanges = vi.fn()
    const stop = useMileage.subscribe(ownChanges)
    deleteTrip('ours')
    deleteVehicleSetup('setup-copy')
    deleteFuelPrice('price-copy')
    stop()
    expect(ownChanges).not.toHaveBeenCalled()
    expect(tombstoneIds(shared())).toEqual(['ours', 'price-copy', 'setup-copy'])
  })

  it("deletes a Shared Car's car with its setups and trips", () => {
    deleteVehicle('mazda')
    expect(shared()).toMatchObject({
      vehicles: [],
      vehicleSetups: [],
      trips: [],
    })
    expect(tombstoneIds(shared())).toEqual(['mazda', 'ours', 'setup-copy'])
    expect(ids(own().trips)).toEqual(['mine'])
  })

  it("deletes a Shared Car's fuel with its prices", () => {
    deleteFuel('gas-copy')
    expect(shared()).toMatchObject({ fuels: [], fuelPrices: [] })
    expect(tombstoneIds(shared())).toEqual(['gas-copy', 'price-copy'])
    expect(ids(own().fuels)).toEqual(['gas'])
  })

  it('leaves Shared Cars out of Delete All', () => {
    const before = shared()
    deleteAllMileageData()
    expect(own()).toMatchObject({ vehicles: [], fuels: [], trips: [] })
    expect(tombstoneIds(own())).toEqual(['civic', 'gas', 'mine'])
    expect(shared()).toBe(before)
  })

  it('refuses a trip whose car is in neither store', () => {
    const before = { own: own(), cars: useSharedCars.getState().cars }
    expect(saveTrip(trip('orphan', 'gone'))).toBe(false)
    expect(own()).toBe(before.own)
    expect(useSharedCars.getState().cars).toBe(before.cars)
    expect(saveTrip(trip('new', 'civic'))).toBe(true)
    expect(saveTrip(trip('new-shared', 'mazda'))).toBe(true)
  })

  it('refuses a trip saved after its Shared Car ended', () => {
    // A form opened on the car before it ended: the car went, and its copy
    // is one of the User's own cars under another id.
    useSharedCars.getState().removeSharedCar('s1')
    useMileage.getState().mergeRecords({
      vehicles: [
        { id: 'mazda-copy', name: 'Mazda', createdAt: 1, updatedAt: 1 },
      ],
    })

    expect(saveTrip(trip('late', 'mazda'))).toBe(false)
    expect(getMileageView().trips.some((t) => t.id === 'late')).toBe(false)
    // Editing a trip that was on it: nothing comes back under its old id.
    expect(saveTrip({ ...trip('ours', 'mazda'), loggedBy: 'anna' })).toBe(false)
    expect(getMileageView().trips.map((t) => t.id)).toEqual(['mine'])
  })

  it('keeps who logged a trip moved from one Shared Car to another', () => {
    useSharedCars.getState().saveSharedCar(
      sharedCar('s2', {
        myMemberId: 'me-2',
        vehicles: [{ id: 'van', name: 'Van', createdAt: 1, updatedAt: 1 }],
      })
    )
    const viewed = getMileageView().trips.find((t) => t.id === 'ours')!
    expect(saveTrip({ ...viewed, vehicleId: 'van' })).toBe(true)

    const van = useSharedCars.getState().cars.s2
    expect(van.trips).toEqual([
      expect.objectContaining({
        id: 'ours',
        vehicleId: 'van',
        loggedBy: 'anna',
        editedBy: 'me-2',
      }),
    ])
    expect(van.pendingPuts).toEqual(['ours'])
    expect(ids(shared().trips)).toEqual([])
    expect(tombstoneIds(shared())).toEqual(['ours'])
    expect(getMileageView().trips.filter((t) => t.id === 'ours')).toHaveLength(
      1
    )
  })
})

describe('mileage writes on a long history', () => {
  const MANY = 5000

  beforeEach(() => {
    const ownTrips = Array.from({ length: MANY }, (_, n) => ({
      ...trip(`own-${n}`, 'civic'),
      updatedAt: 1,
    }))
    const sharedTrips = Array.from({ length: MANY }, (_, n) => ({
      ...trip(`shared-${n}`, 'mazda'),
      loggedBy: n % 2 ? 'me' : 'anna',
      updatedAt: 1,
    }))
    useMileage.setState({ trips: ownTrips })
    useSharedCars.getState().saveSharedCar({ ...shared(), trips: sharedTrips })
  })

  it('keeps the view through a sync’s bookkeeping', () => {
    const view = getMileageView()
    expect(view.trips).toHaveLength(2 * MANY)
    useSharedCars.getState().saveSharedCar({
      ...shared(),
      seq: 4000,
      lastSyncedAt: NOW,
      pendingPuts: ['shared-1', 'shared-2'],
    })
    expect(getMileageView()).toBe(view)
  })

  it('writes one trip at a time without rebuilding the rest', () => {
    const before = getMileageView()
    const started = performance.now()
    for (let n = 0; n < 100; n++) {
      saveTrip({ ...before.trips[n], distanceMiles: 20 })
      saveTrip({ ...before.trips[MANY + n], distanceMiles: 20 })
    }
    const elapsed = performance.now() - started
    const after = getMileageView()

    expect(after.trips).toHaveLength(2 * MANY)
    expect(after.trips.filter((t) => t.distanceMiles === 20)).toHaveLength(200)
    expect(after.vehicles).toBe(before.vehicles)
    expect(after.fuels).toBe(before.fuels)
    expect(after.fuelPrices).toBe(before.fuelPrices)
    expect(after.vehicleSetups).toBe(before.vehicleSetups)
    // Every edit on the Shared Car keeps who logged it.
    expect(
      shared()
        .trips.slice(0, 100)
        .every(
          (t) => t.loggedBy === (Number(t.id.split('-')[1]) % 2 ? 'me' : 'anna')
        )
    ).toBe(true)
    // Each write is linear in the history: 200 over 10,000 trips take well
    // under this on any machine, however busy. A quadratic one would not.
    expect(elapsed).toBeLessThan(5000)
  })
})
