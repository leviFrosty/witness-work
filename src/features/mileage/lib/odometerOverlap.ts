import { compareTripsNewestFirst } from '@/lib/mileage/calc'
import type { Trip } from '@/types/mileage'

const SAME_READING = 1e-6

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
