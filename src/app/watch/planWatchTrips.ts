import moment from 'moment'
import { defaultVehicleId } from '@/lib/mileage/calc'
import type { MileageTombstone, Trip, Vehicle } from '@/types/mileage'
import { WATCH_ORIGINS } from '@/app/watch/planWatchEntries'
import type { WatchOrigin, WatchTripDraft } from '../../../modules/watch-bridge'

export type WatchTripPlan =
  | { id: string; status: 'add'; trip: Trip; origin: WatchOrigin }
  | { id: string; status: 'duplicate' }
  | { id: string; status: 'deleted' }
  | { id: string; status: 'noVehicle' }
  | { id: string; status: 'invalid' }

type Existing = {
  trips: Trip[]
  vehicles: Vehicle[]
  deletedMileageRecords: MileageTombstone[]

  ownTrips?: Trip[]
}

const MAX_MILES = 200_000

function isValidDraft(draft: WatchTripDraft): boolean {
  return (
    typeof draft.id === 'string' &&
    draft.id.length > 0 &&
    draft.id.length <= 64 &&
    typeof draft.date === 'string' &&
    moment(draft.date, 'YYYY-MM-DD', true).isValid() &&
    (draft.vehicleId === null || typeof draft.vehicleId === 'string') &&
    typeof draft.distanceMiles === 'number' &&
    Number.isFinite(draft.distanceMiles) &&
    draft.distanceMiles > 0 &&
    draft.distanceMiles <= MAX_MILES &&
    typeof draft.roundTrip === 'boolean' &&
    WATCH_ORIGINS.includes(draft.origin)
  )
}

export function planWatchTrips(
  drafts: WatchTripDraft[],
  existing: Existing,
  now = Date.now()
): WatchTripPlan[] {
  const savedIds = new Set(existing.trips.map((trip) => trip.id))
  const deletedIds = new Set(existing.deletedMileageRecords.map((t) => t.id))
  const vehicleIds = new Set(existing.vehicles.map((vehicle) => vehicle.id))
  const fallbackId = defaultVehicleId(
    existing.ownTrips ?? existing.trips,
    existing.vehicles
  )

  return drafts.map((draft): WatchTripPlan => {
    if (!isValidDraft(draft)) return { id: String(draft.id), status: 'invalid' }
    if (savedIds.has(draft.id)) return { id: draft.id, status: 'duplicate' }
    if (deletedIds.has(draft.id)) return { id: draft.id, status: 'deleted' }

    const vehicleId =
      draft.vehicleId && vehicleIds.has(draft.vehicleId)
        ? draft.vehicleId
        : fallbackId
    if (!vehicleId) return { id: draft.id, status: 'noVehicle' }
    savedIds.add(draft.id)

    return {
      id: draft.id,
      status: 'add',
      origin: draft.origin,
      trip: {
        id: draft.id,
        vehicleId,
        date: draft.date,
        distanceMiles: draft.distanceMiles,
        roundTrip: draft.roundTrip || undefined,
        createdAt: now,
      },
    }
  })
}
