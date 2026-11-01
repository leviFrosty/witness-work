import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import { buildMileageIndex, estimateTrip } from '@/lib/mileage/calc'
import { buildMileageView, fuelsForVehicle } from '@/lib/mileage/view'
import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import {
  getMileageView,
  subscribeMileageView,
  useMileageView,
} from '@/stores/mileageView'
import { sharedCar } from '@/lib/mileage/testing/sharedCars'
import type {
  Fuel,
  FuelPrice,
  MileageSnapshot,
  MileageView,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'

const own = (overrides: Partial<MileageSnapshot> = {}): MileageSnapshot => ({
  vehicles: [],
  fuels: [],
  fuelPrices: [],
  vehicleSetups: [],
  trips: [],
  deletedMileageRecords: [],
  ...overrides,
})

const civic: Vehicle = { id: 'civic', name: 'Civic', createdAt: 1 }
const mazda: Vehicle = { id: 'mazda', name: 'Mazda', createdAt: 1 }
const trip = (id: string, vehicleId: string, distanceMiles = 10): Trip => ({
  id,
  vehicleId,
  date: '2026-10-01',
  distanceMiles,
  createdAt: 1,
})
const fuel = (id: string): Fuel => ({ id, name: 'Gasoline', createdAt: 1 })
const price = (id: string, fuelId: string, pricePerGallon: number) =>
  ({
    id,
    fuelId,
    effectiveFrom: '2026-01-01',
    pricePerGallon,
  }) satisfies FuelPrice
const setup = (id: string, vehicleId: string, fuelId: string) =>
  ({
    id,
    vehicleId,
    effectiveFrom: '2026-01-01',
    fuelId,
    milesPerGallon: 10,
  }) satisfies VehicleSetup

describe('buildMileageView', () => {
  it("is the User's own mileage, as it is, with no Shared Cars", () => {
    const mine = own({
      vehicles: [civic],
      fuels: [fuel('gas')],
      fuelPrices: [price('p', 'gas', 3)],
      vehicleSetups: [setup('s', 'civic', 'gas')],
      trips: [trip('t', 'civic')],
      deletedMileageRecords: [{ id: 'gone', deletedAt: 1 }],
    })
    const view = buildMileageView(mine, {})

    expect(view.vehicles).toBe(mine.vehicles)
    expect(view.fuels).toBe(mine.fuels)
    expect(view.fuelPrices).toBe(mine.fuelPrices)
    expect(view.vehicleSetups).toBe(mine.vehicleSetups)
    expect(view.trips).toBe(mine.trips)
    expect(view.deletedMileageRecords).toBe(mine.deletedMileageRecords)
    expect(view.sharedRecordSpaces.size).toBe(0)
    expect(buildMileageView(mine, {})).toBe(view)
  })

  it("adds each Shared Car after the User's own, marked with its space", () => {
    const view = buildMileageView(
      own({ vehicles: [civic], trips: [trip('mine', 'civic')] }),
      {
        s1: sharedCar('s1', {
          vehicles: [mazda],
          trips: [trip('ours', 'mazda')],
          deletedMileageRecords: [{ id: 'gone', deletedAt: 2 }],
        }),
      }
    )

    expect(view.vehicles).toEqual([civic, { ...mazda, spaceId: 's1' }])
    expect(view.vehicles[0]).not.toHaveProperty('spaceId')
    expect(view.trips.map((t) => t.id)).toEqual(['mine', 'ours'])
    expect(view.deletedMileageRecords).toEqual([{ id: 'gone', deletedAt: 2 }])
    expect(Object.fromEntries(view.sharedRecordSpaces)).toEqual({
      mazda: 's1',
      ours: 's1',
    })
  })

  it('keeps cars in the order they were added, so sharing one doesn’t move it', () => {
    const van: Vehicle = { id: 'van', name: 'Family Minivan', createdAt: 1 }
    const sedan: Vehicle = { id: 'sedan', name: 'Corolla', createdAt: 2 }
    const later: Vehicle = { id: 'later', name: 'Truck', createdAt: 2 }
    const view = buildMileageView(own({ vehicles: [sedan, later] }), {
      s1: sharedCar('s1', { vehicles: [van] }),
    })

    expect(view.vehicles.map((v) => v.id)).toEqual(['van', 'sedan', 'later'])
  })

  it("hides the User's own copy of a record a Shared Car holds", () => {
    const view = buildMileageView(
      own({
        vehicles: [civic, { ...mazda, name: 'Stale' }],
        trips: [trip('ours', 'mazda', 1), trip('mine', 'civic')],
      }),
      {
        s1: sharedCar('s1', {
          vehicles: [mazda],
          trips: [trip('ours', 'mazda')],
        }),
      }
    )

    expect(view.vehicles.map((v) => v.name)).toEqual(['Civic', 'Mazda'])
    expect(view.trips).toEqual([
      trip('mine', 'civic'),
      trip('ours', 'mazda', 10),
    ])
  })

  it("shows the User's own record when a Shared Car only deleted its id", () => {
    const view = buildMileageView(
      own({ vehicles: [civic], trips: [trip('moved', 'civic')] }),
      {
        s1: sharedCar('s1', {
          vehicles: [mazda],
          deletedMileageRecords: [{ id: 'moved', deletedAt: 5 }],
        }),
      }
    )
    expect(view.trips).toEqual([trip('moved', 'civic')])
  })

  it('shows an id two Shared Cars hold once, from the first', () => {
    const view = buildMileageView(own(), {
      s1: sharedCar('s1', { trips: [trip('t', 'a', 1)] }),
      s2: sharedCar('s2', { trips: [trip('t', 'b', 2)] }),
    })
    expect(view.trips).toEqual([trip('t', 'a', 1)])
    expect(view.sharedRecordSpaces.get('t')).toBe('s1')
  })

  it("prices a Shared Car's trips with its own fuels", () => {
    const view = buildMileageView(
      own({
        vehicles: [civic],
        fuels: [fuel('gas')],
        fuelPrices: [price('p', 'gas', 3)],
        vehicleSetups: [setup('s', 'civic', 'gas')],
      }),
      {
        s1: sharedCar('s1', {
          vehicles: [mazda],
          fuels: [fuel('gas-copy')],
          fuelPrices: [price('p-copy', 'gas-copy', 5)],
          vehicleSetups: [setup('s-copy', 'mazda', 'gas-copy')],
        }),
      }
    )
    const index = buildMileageIndex(view.vehicleSetups, view.fuelPrices)

    expect(estimateTrip(trip('mine', 'civic'), index)).toMatchObject({
      fuelId: 'gas',
      cost: 3,
    })
    expect(estimateTrip(trip('ours', 'mazda'), index)).toMatchObject({
      fuelId: 'gas-copy',
      cost: 5,
    })
    expect(fuelsForVehicle(view, 'civic').map((f) => f.id)).toEqual(['gas'])
    expect(fuelsForVehicle(view).map((f) => f.id)).toEqual(['gas'])
    expect(fuelsForVehicle(view, 'mazda').map((f) => f.id)).toEqual([
      'gas-copy',
    ])
  })

  it("offers every fuel to every car when there's no Shared Car", () => {
    const view = buildMileageView(own({ fuels: [fuel('gas')] }), {})
    expect(fuelsForVehicle(view, 'civic')).toBe(view.fuels)
  })

  it('keeps every unchanged collection, and the view, between builds', () => {
    const mine = own({
      vehicles: [civic],
      vehicleSetups: [setup('s', 'civic', 'gas')],
      trips: [trip('mine', 'civic')],
    })
    let s1 = sharedCar('s1', {
      vehicles: [mazda],
      fuelPrices: [price('p', 'gas-copy', 5)],
      trips: [trip('ours', 'mazda')],
    })
    const first = buildMileageView(mine, { s1 })

    s1 = { ...s1, seq: 40, pendingPuts: ['ours'] }
    expect(buildMileageView(mine, { s1 })).toBe(first)

    s1 = { ...s1, trips: [...s1.trips, trip('more', 'mazda')] }
    const second = buildMileageView(mine, { s1 })
    expect(second.trips.map((t) => t.id)).toEqual(['mine', 'ours', 'more'])
    expect(second.vehicles).toBe(first.vehicles)
    expect(second.vehicleSetups).toBe(first.vehicleSetups)
    expect(second.fuelPrices).toBe(first.fuelPrices)
    expect(buildMileageIndex(second.vehicleSetups, second.fuelPrices)).toBe(
      buildMileageIndex(first.vehicleSetups, first.fuelPrices)
    )

    const third = buildMileageView(
      { ...mine, trips: [...mine.trips, trip('mine-2', 'civic')] },
      { s1 }
    )
    expect(third.sharedRecordSpaces).toBe(second.sharedRecordSpaces)
    expect(third.vehicles).toBe(second.vehicles)
  })
})

describe('the view as a Shared Car ends', () => {
  it("shows the copy alone, not the User's own records the car hid", () => {
    const mine = own({
      vehicles: [civic, { ...mazda, name: 'Stale' }],
      trips: [trip('ours', 'mazda', 1)],
    })
    const car = sharedCar('s1', {
      vehicles: [mazda],
      trips: [trip('ours', 'mazda', 10)],
    })
    expect(buildMileageView(mine, { s1: car }).trips).toEqual([
      trip('ours', 'mazda', 10),
    ])

    const ended = own({
      vehicles: [civic, { ...mazda, id: 'mazda-copy' }],
      trips: [{ ...trip('ours-copy', 'mazda-copy', 10) }],
      deletedMileageRecords: [
        { id: 'mazda', deletedAt: 9 },
        { id: 'ours', deletedAt: 9 },
      ],
    })
    const view = buildMileageView(ended, {})
    expect(view.vehicles.map((v) => [v.id, v.name, v.spaceId])).toEqual([
      ['civic', 'Civic', undefined],
      ['mazda-copy', 'Mazda', undefined],
    ])
    expect(view.trips.map((t) => t.id)).toEqual(['ours-copy'])
    expect(view.sharedRecordSpaces.size).toBe(0)
  })
})

describe('the view of a long history', () => {
  it('builds once, and keeps every collection a change leaves alone', () => {
    const MANY = 5000
    const mine = own({
      vehicles: [civic],
      trips: Array.from({ length: MANY }, (_, n) => trip(`own-${n}`, 'civic')),
    })
    let s1 = sharedCar('s1', {
      vehicles: [mazda],
      trips: Array.from({ length: MANY }, (_, n) =>
        trip(`shared-${n}`, 'mazda')
      ),
    })
    const first = buildMileageView(mine, { s1 })
    expect(first.trips).toHaveLength(2 * MANY)
    expect(first.sharedRecordSpaces.size).toBe(MANY + 1)

    const started = performance.now()
    for (let seq = 1; seq <= 1000; seq++) {
      s1 = { ...s1, seq, lastSyncedAt: seq, pendingPuts: [`shared-${seq}`] }
      expect(buildMileageView(mine, { s1 })).toBe(first)
    }

    expect(performance.now() - started).toBeLessThan(2000)

    const second = buildMileageView(
      { ...mine, trips: [...mine.trips, trip('own-more', 'civic')] },
      { s1 }
    )
    expect(second.trips).toHaveLength(2 * MANY + 1)
    expect(second.sharedRecordSpaces).toBe(first.sharedRecordSpaces)
    expect(second.vehicles).toBe(first.vehicles)
  })
})

const resetStores = () => {
  useMileage.getState()._WARNING_forceDeleteMileage()
  useSharedCars.setState(useSharedCars.getInitialState(), true)
}

describe('getMileageView', () => {
  beforeEach(resetStores)

  it('reads both stores', () => {
    useMileage.getState().saveVehicle(civic)
    useSharedCars
      .getState()
      .saveSharedCar(sharedCar('s1', { vehicles: [mazda] }))
    expect(getMileageView().vehicles.map((v) => [v.id, v.spaceId])).toEqual([
      ['civic', undefined],
      ['mazda', 's1'],
    ])
  })

  it('tells subscribers when the view changes, not on bookkeeping', () => {
    useSharedCars
      .getState()
      .saveSharedCar(sharedCar('s1', { vehicles: [mazda] }))
    const listener = vi.fn()
    const stop = subscribeMileageView(listener)

    useSharedCars.setState((state) => ({
      cars: { s1: { ...state.cars.s1, seq: 12 } },
    }))
    expect(listener).not.toHaveBeenCalled()

    useMileage.getState().saveTrip(trip('mine', 'civic'))
    useSharedCars.getState().saveTrip('s1', trip('ours', 'mazda'))
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(getMileageView())

    stop()
    useMileage.getState().deleteTrip('mine')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

function Probe<T>({
  select,
  onRender,
}: {
  select: (view: MileageView) => T
  onRender: (value: T) => void
}) {
  onRender(useMileageView(select))
  return null
}

describe('useMileageView', () => {
  let renderer: ReactTestRenderer | undefined
  beforeEach(resetStores)
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
  })

  it('re-renders when what it reads changes', async () => {
    const activeCar: boolean[] = []
    const views: MileageView[] = []
    await act(async () => {
      renderer = create(
        <>
          <Probe
            select={(view) => view.vehicles.some((v) => !v.archived)}
            onRender={(value) => activeCar.push(value)}
          />
          <Probe
            select={(view) => view}
            onRender={(value) => views.push(value)}
          />
        </>
      )
    })
    expect(activeCar.at(-1)).toBe(false)

    await act(async () => {
      useSharedCars
        .getState()
        .saveSharedCar(sharedCar('s1', { vehicles: [mazda] }))
    })
    expect(activeCar.at(-1)).toBe(true)
    expect(views.at(-1)).toBe(getMileageView())
    const settled = activeCar.length

    await act(async () => {
      useSharedCars.getState().saveTrip('s1', trip('ours', 'mazda'))
    })
    expect(activeCar).toHaveLength(settled)
    expect(views.at(-1)?.trips.map((t) => t.id)).toEqual(['ours'])
  })
})
