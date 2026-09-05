import {
  MileageData,
  MileageDistancePreference,
  MileageDistanceUnit,
  MileageEntry,
  MileageVehicle,
} from '@/types/mileage'

export const METERS_PER_MILE = 1609.344

export function resolveMileageDistanceUnit(
  preference: MileageDistancePreference,
  measurementSystem?: string | null
): MileageDistanceUnit {
  if (preference !== 'auto') return preference
  return measurementSystem === 'us' || measurementSystem === 'uk' ? 'mi' : 'km'
}

export function toMeters(value: number, unit: MileageDistanceUnit): number {
  return value * (unit === 'mi' ? METERS_PER_MILE : 1000)
}

export function fromMeters(value: number, unit: MileageDistanceUnit): number {
  return value / (unit === 'mi' ? METERS_PER_MILE : 1000)
}

export function formatMileageDistance(
  meters: number,
  unit: MileageDistanceUnit,
  locale?: string
): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(fromMeters(meters, unit))} ${unit}`
}

/** Accept decimal input, not exponent notation or ambiguous group separators. */
export function parseMileageNumber(
  text: string,
  locale?: string,
  decimalSeparator?: string | null
): number | null {
  const decimal = decimalSeparator ?? mileageDecimalSeparator(locale)
  const digits = new Intl.NumberFormat(locale, { useGrouping: false })
  let normalized = text.trim()
  for (let value = 0; value < 10; value++) {
    normalized = normalized.split(digits.format(value)).join(String(value))
  }
  if (decimal !== '.') {
    if (normalized.includes('.')) return null
    normalized = normalized.split(decimal).join('.')
  }
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function formatMileageInput(
  meters: number,
  unit: MileageDistanceUnit,
  locale?: string,
  decimalSeparator?: string | null
): string {
  return formatMileageNumberInput(
    fromMeters(meters, unit),
    locale,
    decimalSeparator
  )
}

/** Hermes builds may support NumberFormat.format without formatToParts. */
function mileageDecimalSeparator(locale?: string): string {
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false })
  return formatter.format(1.1).split(formatter.format(1)).join('') || '.'
}

export function formatMileageNumberInput(
  value: number,
  locale?: string,
  decimalSeparator?: string | null
): string {
  const formatted = new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits: 2,
  }).format(value)
  return decimalSeparator
    ? formatted.replace(mileageDecimalSeparator(locale), decimalSeparator)
    : formatted
}

export function localMileageDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function mileageDateToLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export type MileageValidationCode =
  | 'date'
  | 'vehicle'
  | 'category'
  | 'distance'
  | 'odometer'
  | 'inProgress'
  | 'name'
  | 'combinedMpg'
  | 'avatar'

export class MileageValidationError extends Error {
  constructor(public code: MileageValidationCode) {
    super(`Invalid mileage ${code}`)
    this.name = 'MileageValidationError'
  }
}

const nonnegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

export function validateMileageVehicle(vehicle: MileageVehicle): void {
  if (!vehicle.name.trim()) throw new MileageValidationError('name')
  if (
    vehicle.combinedMpg !== undefined &&
    (!nonnegative(vehicle.combinedMpg) || vehicle.combinedMpg === 0)
  )
    throw new MileageValidationError('combinedMpg')
  if (vehicle.avatar.type !== 'emoji' && vehicle.avatar.type !== 'none')
    throw new MileageValidationError('avatar')
}

/** Validate and derive canonical distance. Edits retain archived references. */
export function validateMileageEntry(
  entry: MileageEntry,
  data: Pick<MileageData, 'entries' | 'vehicles' | 'categories'>,
  today = localMileageDate()
): MileageEntry {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
    localMileageDate(mileageDateToLocalDate(entry.date)) !== entry.date ||
    entry.date > today
  )
    throw new MileageValidationError('date')
  const previous = data.entries.find((item) => item.id === entry.id)
  const vehicle = data.vehicles.find((item) => item.id === entry.vehicleId)
  if (
    !vehicle ||
    (vehicle.archivedAt !== undefined && previous?.vehicleId !== vehicle.id)
  )
    throw new MileageValidationError('vehicle')
  if (entry.categoryId) {
    const category = data.categories.find(
      (item) => item.id === entry.categoryId
    )
    if (
      !category ||
      (category.archivedAt !== undefined &&
        previous?.categoryId !== category.id)
    )
      throw new MileageValidationError('category')
  }
  if (entry.mode === 'distance') {
    if (
      entry.status !== 'completed' ||
      !nonnegative(entry.distanceMeters) ||
      entry.distanceMeters === 0
    )
      throw new MileageValidationError('distance')
    return {
      ...entry,
      startOdometerMeters: undefined,
      endOdometerMeters: undefined,
    }
  }
  if (entry.mode !== 'odometer' || !nonnegative(entry.startOdometerMeters))
    throw new MileageValidationError('odometer')
  if (entry.status === 'inProgress') {
    if (entry.endOdometerMeters !== undefined)
      throw new MileageValidationError('odometer')
    if (
      data.entries.some(
        (item) =>
          item.id !== entry.id &&
          item.vehicleId === entry.vehicleId &&
          item.status === 'inProgress'
      )
    )
      throw new MileageValidationError('inProgress')
    return { ...entry, distanceMeters: undefined }
  }
  if (
    entry.status !== 'completed' ||
    !nonnegative(entry.endOdometerMeters) ||
    entry.endOdometerMeters <= entry.startOdometerMeters
  )
    throw new MileageValidationError('odometer')
  return {
    ...entry,
    distanceMeters: entry.endOdometerMeters - entry.startOdometerMeters,
  }
}

export function defaultMileageVehicle(
  vehicles: MileageVehicle[],
  lastVehicleId?: string | null
): MileageVehicle | undefined {
  return (
    vehicles.find(
      (vehicle) =>
        vehicle.id === lastVehicleId && vehicle.archivedAt === undefined
    ) ?? vehicles.find((vehicle) => vehicle.archivedAt === undefined)
  )
}
