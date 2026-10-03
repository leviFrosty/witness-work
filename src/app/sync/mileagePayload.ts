import type { SyncPayload } from '@/app/sync/payload'
import type {
  Fuel,
  FuelPrice,
  MileageSnapshot,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'

/** A payload's mileage slice, defaulting every collection for older writers. */
export function mileageFromPayload(payload: SyncPayload): MileageSnapshot {
  const slice = payload.mileageStore
  return {
    vehicles: (slice?.vehicles ?? []) as Vehicle[],
    fuels: (slice?.fuels ?? []) as Fuel[],
    fuelPrices: (slice?.fuelPrices ?? []) as FuelPrice[],
    vehicleSetups: (slice?.vehicleSetups ?? []) as VehicleSetup[],
    trips: (slice?.trips ?? []) as Trip[],
    deletedMileageRecords: slice?.deletedMileageRecords ?? [],
  }
}
