import { compareTripsNewestFirst } from '@/lib/mileage/calc'
import type { Trip } from '@/types/mileage'

/** Readings converted between units differ by less than this, in miles. */
const SAME_READING = 1e-6

/**
 * Another trip on the car whose odometer readings overlap `startMiles` to
 * `endMiles`, the newest when there are several: the same drive logged twice,
 * or a reading typed wrong. On a Shared Car someone else may have logged it
 * (docs/shared-cars-protocol.md, "Odometer"). Readings that only meet, one trip
 * ending where the next starts, don't overlap. Leaves out `excludeTripId` (the
 * trip being edited) and trips logged by distance.
 */
export function overlappingOdometerTrip(
  trips: readonly Trip[],
  {
    vehicleId,
    startMiles,
    endMiles,
    excludeTripId,
  }: {
    vehicleId: string
    startMiles: number
    endMiles: number
    excludeTripId?: string
  }
): Trip | undefined {
  let found: Trip | undefined
  for (const trip of trips) {
    if (
      trip.vehicleId !== vehicleId ||
      trip.id === excludeTripId ||
      trip.odometerStartMiles === undefined ||
      trip.odometerEndMiles === undefined
    )
      continue
    const overlaps =
      startMiles < trip.odometerEndMiles - SAME_READING &&
      trip.odometerStartMiles < endMiles - SAME_READING
    if (overlaps && (!found || compareTripsNewestFirst(trip, found) < 0))
      found = trip
  }
  return found
}
