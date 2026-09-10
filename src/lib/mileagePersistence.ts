import { z } from 'zod'
import { MileageData } from '@/types/mileage'

const id = z.string().min(1)
const timestamp = z.number().finite().nonnegative()
const record = z.object({
  id,
  createdAt: timestamp,
  updatedAt: timestamp,
})
const vehicle = record.extend({
  name: z.string().trim().min(1),
  combinedMpg: z.number().finite().positive().optional(),
  avatar: z.object({ type: z.enum(['none', 'emoji']), value: z.string() }),
  avatarBackground: z.string(),
  archivedAt: timestamp.optional(),
})
const category = record.extend({
  name: z.string().trim().min(1),
  archivedAt: timestamp.optional(),
})
const meters = z.number().finite().nonnegative()
const entry = record
  .extend({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T12:00:00Z`)
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        )
      }),
    vehicleId: id,
    categoryId: id.optional(),
    note: z.string().optional(),
    mode: z.enum(['distance', 'odometer']),
    status: z.enum(['completed', 'inProgress']),
    distanceMeters: meters.optional(),
    startOdometerMeters: meters.optional(),
    endOdometerMeters: meters.optional(),
  })
  .refine((value) => {
    if (value.status === 'inProgress') {
      return (
        value.mode === 'odometer' &&
        value.startOdometerMeters !== undefined &&
        value.endOdometerMeters === undefined &&
        value.distanceMeters === undefined
      )
    }
    if (!(value.distanceMeters !== undefined && value.distanceMeters > 0))
      return false
    if (value.mode === 'distance') return true
    if (
      value.startOdometerMeters === undefined ||
      value.endOdometerMeters === undefined
    )
      return false
    const difference = value.endOdometerMeters - value.startOdometerMeters
    return (
      difference > 0 && Math.abs(difference - value.distanceMeters) < 0.000001
    )
  })
const tombstone = z.object({ id, deletedAt: timestamp })
const schema = z
  .object({
    vehicles: z.array(vehicle),
    categories: z.array(category),
    entries: z.array(entry),
    deletedVehicles: z.array(tombstone),
    deletedCategories: z.array(tombstone),
    deletedEntries: z.array(tombstone),
  })
  .refine((data) => {
    const vehicles = new Set(data.vehicles.map((item) => item.id))
    const categories = new Set(data.categories.map((item) => item.id))
    const entryIds = new Set(data.entries.map((item) => item.id))
    return (
      vehicles.size === data.vehicles.length &&
      categories.size === data.categories.length &&
      entryIds.size === data.entries.length &&
      data.entries.every(
        (item) =>
          vehicles.has(item.vehicleId) &&
          (!item.categoryId || categories.has(item.categoryId))
      )
    )
  })

/** Only the durable data crosses backup/sync boundaries, never store methods. */
export function mileageSnapshot(data: MileageData): MileageData {
  return {
    vehicles: data.vehicles,
    categories: data.categories,
    entries: data.entries,
    deletedVehicles: data.deletedVehicles,
    deletedCategories: data.deletedCategories,
    deletedEntries: data.deletedEntries,
  }
}

export function emptyMileageData(): MileageData {
  return {
    vehicles: [],
    categories: [],
    entries: [],
    deletedVehicles: [],
    deletedCategories: [],
    deletedEntries: [],
  }
}

/** Validate an entire mileage slice before any restore writes occur. */
export function parseMileageData(value: unknown): MileageData | null {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Older backups have no mileage slice and must leave mileage history alone. */
export function mileageForRestore(
  value: unknown,
  current: MileageData
): MileageData {
  if (value === undefined) return mileageSnapshot(current)
  const parsed = parseMileageData(value)
  if (!parsed) throw new Error('Invalid mileage backup')
  return parsed
}
