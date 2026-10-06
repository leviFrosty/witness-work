import { describe, expect, it } from 'vitest'
import { planWatchTrips } from '@/app/watch/planWatchTrips'
import type { WatchTripDraft } from '../../modules/watch-bridge'
import type { Trip, Vehicle } from '@/types/mileage'

const draft = (overrides: Partial<WatchTripDraft> = {}): WatchTripDraft => ({
  id: 'trip-1',
  date: '2026-10-04',
  vehicleId: 'mazda',
  distanceMiles: 12,
  roundTrip: false,
  origin: 'phoneShortcut',
  ...overrides,
})

const mazda: Vehicle = { id: 'mazda', name: 'Mazda', createdAt: 1 }
const honda: Vehicle = { id: 'honda', name: 'Honda', createdAt: 1 }
const lastTrip: Trip = {
  id: 'earlier',
  vehicleId: 'honda',
  date: '2026-10-01',
  distanceMiles: 3,
  createdAt: 5,
}

const existing = {
  trips: [lastTrip],
  vehicles: [mazda, honda],
  deletedMileageRecords: [],
}

describe('planWatchTrips', () => {
  it('adds a trip under the draft id for the chosen car', () => {
    const [plan] = planWatchTrips([draft()], existing, 42)

    expect(plan).toEqual({
      id: 'trip-1',
      status: 'add',
      origin: 'phoneShortcut',
      trip: {
        id: 'trip-1',
        vehicleId: 'mazda',
        date: '2026-10-04',
        distanceMiles: 12,
        roundTrip: undefined,
        createdAt: 42,
      },
    })
  })

  it('keeps an archived car the user chose', () => {
    const [plan] = planWatchTrips([draft()], {
      ...existing,
      vehicles: [{ ...mazda, archived: true }, honda],
    })

    expect(plan).toMatchObject({ status: 'add', trip: { vehicleId: 'mazda' } })
  })

  it('uses the car a new trip would when the chosen one was deleted', () => {
    const [plan] = planWatchTrips([draft({ vehicleId: 'gone' })], existing)

    expect(plan).toMatchObject({ status: 'add', trip: { vehicleId: 'honda' } })
  })

  it('skips a trip with no car left to log it to', () => {
    const [plan] = planWatchTrips([draft()], {
      ...existing,
      vehicles: [],
    })

    expect(plan).toEqual({ id: 'trip-1', status: 'noVehicle' })
  })

  it('recognizes repeats and trips deleted before they arrived', () => {
    const plans = planWatchTrips([draft(), draft(), draft({ id: 'trip-2' })], {
      ...existing,
      deletedMileageRecords: [{ id: 'trip-2', deletedAt: 1 }],
    })

    expect(plans.map((plan) => plan.status)).toEqual([
      'add',
      'duplicate',
      'deleted',
    ])
  })

  it('rejects malformed drafts', () => {
    const plans = planWatchTrips(
      [
        draft({ distanceMiles: 0 }),
        draft({ distanceMiles: Number.NaN }),
        draft({ date: '2026-13-01' }),
        draft({ origin: 'nope' as WatchTripDraft['origin'] }),
      ],
      existing
    )

    expect(plans.every((plan) => plan.status === 'invalid')).toBe(true)
  })
})
