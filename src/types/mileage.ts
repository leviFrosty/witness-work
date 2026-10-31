import type { RichText } from '@/types/richText'

/**
 * Mileage Tracking — cars, fuels, and trips. See
 * `docs/mileage-tracking-prd.md`.
 *
 * Every amount is stored in canonical units (miles, US mpg, price per US
 * gallon) and converted for display only, so changing the unit preferences
 * never rewrites data. Calendar dates are local `YYYY-MM-DD` strings.
 */

/** A user-named car ("Mazda CX-5"). Archived cars stay in reports. */
export type Vehicle = {
  id: string
  name: string
  archived?: boolean
  /** Epoch ms. */
  createdAt: number
  updatedAt?: number
}

/**
 * A user-named fuel ("Gasoline", "Diesel", "Electric"). Global: a price change
 * applies to every car using it.
 */
export type Fuel = {
  id: string
  name: string
  /** Epoch ms. */
  createdAt: number
  updatedAt?: number
}

/** Effective-dated fuel price. */
export type FuelPrice = {
  id: string
  fuelId: string
  /** `YYYY-MM-DD`. Applies to trips on or after this date. */
  effectiveFrom: string
  /** Price per US gallon, in the device currency. */
  pricePerGallon: number
  updatedAt?: number
}

/** Effective-dated pairing of a car with a fuel and fuel economy. */
export type VehicleSetup = {
  id: string
  vehicleId: string
  /** `YYYY-MM-DD`. Applies to trips on or after this date. */
  effectiveFrom: string
  fuelId?: string
  /** US miles per gallon. */
  milesPerGallon?: number
  updatedAt?: number
}

export type Trip = {
  id: string
  vehicleId: string
  /** `YYYY-MM-DD`. */
  date: string
  /** Total distance in miles — already doubled for a round trip. */
  distanceMiles: number
  roundTrip?: boolean
  odometerStartMiles?: number
  odometerEndMiles?: number
  note?: string
  /** The note with formatting, when it has any; see `src/lib/richText/notes.ts`. */
  noteDoc?: RichText
  /**
   * The `memberId` of the person who logged it. Only on a Shared Car's trips
   * (`docs/shared-cars-protocol.md`).
   */
  loggedBy?: string
  /** The `memberId` of the last person to change it, on a Shared Car only. */
  editedBy?: string
  /** Epoch ms. */
  createdAt: number
  updatedAt?: number
}

/**
 * Deletion marker for any mileage record. Ids are UUIDs, so one list covers
 * every collection.
 */
export type MileageTombstone = { id: string; deletedAt: number }

export type MileageCollections = {
  vehicles: Vehicle[]
  fuels: Fuel[]
  fuelPrices: FuelPrice[]
  vehicleSetups: VehicleSetup[]
  trips: Trip[]
}

export type MileageSnapshot = MileageCollections & {
  deletedMileageRecords: MileageTombstone[]
}

/** A car in the mileage view: one of the User's own, or a Shared Car. */
export type MileageVehicle = Vehicle & {
  /** The space a Shared Car lives in; absent on the User's own cars. */
  spaceId?: string
}

/**
 * The one view of mileage every reader goes through (`@/stores/mileageView`):
 * the User's own cars and every Shared Car's, in the same collections.
 */
export type MileageView = Omit<MileageSnapshot, 'vehicles'> & {
  vehicles: MileageVehicle[]
  /**
   * The space of every record that lives on a Shared Car, by id. Records
   * missing from it are the User's own.
   */
  sharedRecordSpaces: ReadonlyMap<string, string>
}

export type DistanceUnit = 'mi' | 'km'
export type FuelEconomyUnit = 'mpgUS' | 'mpgUK' | 'lPer100km' | 'kmPerL'
export type MileageEntryMode = 'distance' | 'odometer'
export type MileagePeriodKind = 'day' | 'week' | 'month' | 'year'
