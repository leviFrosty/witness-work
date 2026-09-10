import { ProfileAvatar } from '@/types/avatar'

export type MileageDistanceUnit = 'mi' | 'km'
export type MileageDistancePreference = 'auto' | MileageDistanceUnit
export type MileageEntryMode = 'distance' | 'odometer'

export type MileagePeriod =
  | { kind: 'month'; month: number; year: number }
  | { kind: 'year'; startYear: number }
  | { kind: 'allTime' }

export interface MileageVehicle {
  id: string
  name: string
  combinedMpg?: number
  avatar: ProfileAvatar
  avatarBackground: string
  archivedAt?: number
  createdAt: number
  updatedAt: number
}

export interface MileageCategory {
  id: string
  name: string
  archivedAt?: number
  createdAt: number
  updatedAt: number
}

/** The incurred date is a local calendar date, never a timestamp. */
export interface MileageEntry {
  id: string
  date: string
  vehicleId: string
  categoryId?: string
  note?: string
  mode: MileageEntryMode
  status: 'completed' | 'inProgress'
  distanceMeters?: number
  startOdometerMeters?: number
  endOdometerMeters?: number
  createdAt: number
  updatedAt: number
}

export interface MileageTombstone {
  id: string
  deletedAt: number
}

export interface MileageData {
  vehicles: MileageVehicle[]
  categories: MileageCategory[]
  entries: MileageEntry[]
  deletedVehicles: MileageTombstone[]
  deletedCategories: MileageTombstone[]
  deletedEntries: MileageTombstone[]
}
