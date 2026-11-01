import { describe, expect, it } from 'vitest'
import { overlappingOdometerTrip } from '@/features/mileage/lib/odometerOverlap'
import type { Trip } from '@/types/mileage'

const trip = (
  id: string,
  vehicleId: string,
  start: number | undefined,
  end: number | undefined,
  date = '2026-03-02'
): Trip => ({
  id,
  vehicleId,
  date,
  distanceMiles: start !== undefined && end !== undefined ? end - start : 10,
  odometerStartMiles: start,
  odometerEndMiles: end,
  createdAt: 1,
})

const trips = [
  trip('a', 'van', 1000, 1020, '2026-03-01'),
  trip('b', 'van', 1020, 1050, '2026-03-02'),
  trip('other-car', 'civic', 1000, 1100),
  trip('by-distance', 'van', undefined, undefined),
]

const overlap = (
  startMiles: number,
  endMiles: number,
  excludeTripId?: string
) =>
  overlappingOdometerTrip(trips, {
    vehicleId: 'van',
    startMiles,
    endMiles,
    excludeTripId,
  })?.id

describe('odometer readings that overlap another trip', () => {
  it('find a trip on the same car whose readings overlap', () => {
    expect(overlap(1010, 1030)).toBe('b')
    expect(overlap(1005, 1015)).toBe('a')

    expect(overlap(1025, 1030)).toBe('b')
    expect(overlap(990, 1060)).toBe('b')
  })

  it('pick the newest of several', () => {
    expect(overlap(1015, 1025)).toBe('b')
  })

  it('let readings meet without overlapping', () => {
    expect(overlap(1050, 1070)).toBeUndefined()
    expect(overlap(980, 1000)).toBeUndefined()

    expect(overlap(1050 - 1e-9, 1070)).toBeUndefined()
  })

  it('leave out the trip being edited, other cars, and distance-only trips', () => {
    expect(overlap(1020, 1050, 'b')).toBeUndefined()
    expect(
      overlappingOdometerTrip(trips, {
        vehicleId: 'truck',
        startMiles: 1000,
        endMiles: 1100,
      })
    ).toBeUndefined()
  })
})
