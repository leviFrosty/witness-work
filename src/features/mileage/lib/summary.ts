import type {
  MileageCategory,
  MileageEntry,
  MileagePeriod,
  MileageVehicle,
} from '@/types/mileage'

export type { MileagePeriod } from '@/types/mileage'

export type MileageCategoryTotal = { categoryId?: string; meters: number }
export type MileageVehicleTotal = {
  vehicleId: string
  meters: number
  categories: MileageCategoryTotal[]
}
export type MileageSummary = {
  entries: MileageEntry[]
  completedCount: number
  meters: number
  categories: MileageCategoryTotal[]
  vehicles: MileageVehicleTotal[]
}

/** Calendar dates stay as local day keys; never parse them through UTC. */
export function mileageServiceYear(date: string): number {
  const year = Number(date.slice(0, 4))
  return Number(date.slice(5, 7)) < 9 ? year - 1 : year
}

export function isInMileagePeriod(
  date: string,
  period: MileagePeriod
): boolean {
  if (period.kind === 'allTime') return true
  if (period.kind === 'year')
    return mileageServiceYear(date) === period.startYear
  return date.startsWith(
    `${period.year}-${String(period.month + 1).padStart(2, '0')}-`
  )
}

function addCategory(
  totals: MileageCategoryTotal[],
  entry: MileageEntry,
  meters: number
) {
  const existing = totals.find((total) => total.categoryId === entry.categoryId)
  if (existing) existing.meters += meters
  else totals.push({ categoryId: entry.categoryId, meters })
}

/** One calculation model for history, filtered breakdowns and report output. */
export function summarizeMileage(
  entries: readonly MileageEntry[],
  period: MileagePeriod,
  vehicleId?: string
): MileageSummary {
  const scoped = entries
    .filter(
      (entry) =>
        isInMileagePeriod(entry.date, period) &&
        (!vehicleId || entry.vehicleId === vehicleId)
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.createdAt - a.createdAt ||
        a.id.localeCompare(b.id)
    )
  const result: MileageSummary = {
    entries: scoped,
    completedCount: 0,
    meters: 0,
    categories: [],
    vehicles: [],
  }
  for (const entry of scoped) {
    const meters = entry.distanceMeters
    if (
      entry.status !== 'completed' ||
      meters === undefined ||
      !Number.isFinite(meters) ||
      meters <= 0
    )
      continue
    result.meters += meters
    result.completedCount += 1
    addCategory(result.categories, entry, meters)
    let vehicle = result.vehicles.find(
      (total) => total.vehicleId === entry.vehicleId
    )
    if (!vehicle) {
      vehicle = { vehicleId: entry.vehicleId, meters: 0, categories: [] }
      result.vehicles.push(vehicle)
    }
    vehicle.meters += meters
    addCategory(vehicle.categories, entry, meters)
  }
  return result
}

export function mileageYearMonths(startYear: number) {
  return Array.from({ length: 12 }, (_, index) => ({
    month: (index + 8) % 12,
    year: index < 4 ? startYear : startYear + 1,
  }))
}

export function mileageHistoryYears(
  entries: readonly MileageEntry[],
  vehicleId?: string
) {
  return [
    ...new Set(
      entries
        .filter((entry) => !vehicleId || entry.vehicleId === vehicleId)
        .map((entry) => mileageServiceYear(entry.date))
    ),
  ].sort((a, b) => b - a)
}

export function mileageVehicleLabel(
  vehicles: readonly MileageVehicle[],
  id: string,
  fallback: string
) {
  return vehicles.find((vehicle) => vehicle.id === id)?.name ?? fallback
}

export function mileageCategoryLabel(
  categories: readonly MileageCategory[],
  id: string | undefined,
  uncategorized: string,
  fallback: string
) {
  return id
    ? (categories.find((category) => category.id === id)?.name ?? fallback)
    : uncategorized
}

export type MileageReportLabels = {
  title: string
  total: string
  unknownVehicle: string
  unknownCategory: string
  uncategorized: string
}

/** Summary only: no submission state, odometer boundaries or numeric shortcut. */
export function buildMileageReportText({
  summary,
  vehicles,
  categories,
  labels,
  formatDistance,
}: {
  summary: MileageSummary
  vehicles: readonly MileageVehicle[]
  categories: readonly MileageCategory[]
  labels: MileageReportLabels
  formatDistance: (meters: number) => string
}): string {
  const lines = [
    labels.title,
    `${labels.total}: ${formatDistance(summary.meters)}`,
  ]
  for (const vehicle of summary.vehicles) {
    lines.push(
      `${mileageVehicleLabel(vehicles, vehicle.vehicleId, labels.unknownVehicle)}: ${formatDistance(vehicle.meters)}`
    )
    for (const category of vehicle.categories) {
      lines.push(
        `  ${mileageCategoryLabel(categories, category.categoryId, labels.uncategorized, labels.unknownCategory)}: ${formatDistance(category.meters)}`
      )
    }
  }
  return lines.join('\n')
}

/** Prefill within the browsed history without ever proposing a future trip. */
export function mileageEntryDateForPeriod(
  period: MileagePeriod,
  today: string
): string {
  if (period.kind === 'allTime') return today
  if (period.kind === 'year') {
    const endDate = `${period.startYear + 1}-08-31`
    return endDate < today ? endDate : today
  }
  const monthKey = `${period.year}-${String(period.month + 1).padStart(2, '0')}`
  if (monthKey >= today.slice(0, 7)) return today
  const daysInMonth = new Date(period.year, period.month + 1, 0).getDate()
  const day = Math.min(Number(today.slice(8, 10)), daysInMonth)
  return `${monthKey}-${String(day).padStart(2, '0')}`
}
