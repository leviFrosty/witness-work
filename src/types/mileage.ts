import type { RichText } from '@/types/richText'

export type Vehicle = {
  id: string
  name: string
  archived?: boolean

  createdAt: number
  updatedAt?: number
}

export type Fuel = {
  id: string
  name: string

  createdAt: number
  updatedAt?: number
}

export type FuelPrice = {
  id: string
  fuelId: string

  effectiveFrom: string

  pricePerGallon: number
  updatedAt?: number
}

export type VehicleSetup = {
  id: string
  vehicleId: string

  effectiveFrom: string
  fuelId?: string

  milesPerGallon?: number
  updatedAt?: number
}

export type Trip = {
  id: string
  vehicleId: string

  date: string

  distanceMiles: number
  roundTrip?: boolean
  odometerStartMiles?: number
  odometerEndMiles?: number
  note?: string

  noteDoc?: RichText

  loggedBy?: string

  editedBy?: string

  createdAt: number
  updatedAt?: number
}

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

export type MileageVehicle = Vehicle & {
  spaceId?: string
}

export type MileageView = Omit<MileageSnapshot, 'vehicles'> & {
  vehicles: MileageVehicle[]

  sharedRecordSpaces: ReadonlyMap<string, string>
}

export type DistanceUnit = 'mi' | 'km'
export type FuelEconomyUnit = 'mpgUS' | 'mpgUK' | 'lPer100km' | 'kmPerL'
export type MileageEntryMode = 'distance' | 'odometer'
export type MileagePeriodKind = 'day' | 'week' | 'month' | 'year'
