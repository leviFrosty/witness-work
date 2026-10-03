import moment from 'moment'
import type {
  FuelPrice,
  MileagePeriodKind,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'

/**
 * Pure Mileage math: effective-dated rate lookup, estimated cost, periods, and
 * summaries. Trips never store a rate — cost is derived at read time from the
 * fuel price and car setup in effect on the trip's date.
 */

export const DATE_KEY_FORMAT = 'YYYY-MM-DD'

export const toDateKey = (input: moment.MomentInput) =>
  moment(input).format(DATE_KEY_FORMAT)

export const fromDateKey = (key: string) => moment(key, DATE_KEY_FORMAT, true)

type Dated = { effectiveFrom: string; updatedAt?: number }

const byEffectiveFrom = (a: Dated, b: Dated) =>
  a.effectiveFrom === b.effectiveFrom
    ? (a.updatedAt ?? 0) - (b.updatedAt ?? 0)
    : a.effectiveFrom < b.effectiveFrom
      ? -1
      : 1

/**
 * The entry in effect on `date`: the newest whose `effectiveFrom` is on or
 * before it. Dates before the first entry fall back to the first entry, so a
 * car or price added today also covers trips logged retroactively. `sorted`
 * must be ascending by `effectiveFrom`.
 */
export function effectiveEntry<T extends Dated>(
  sorted: readonly T[] | undefined,
  date: string
): T | undefined {
  if (!sorted || sorted.length === 0) return undefined
  let low = 0
  let high = sorted.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (sorted[mid].effectiveFrom <= date) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return sorted[found === -1 ? 0 : found]
}

function groupSorted<T extends Dated>(
  records: readonly T[],
  key: (record: T) => string
): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const record of records) {
    const id = key(record)
    const group = groups.get(id)
    if (group) group.push(record)
    else groups.set(id, [record])
  }
  for (const group of groups.values()) group.sort(byEffectiveFrom)
  return groups
}

export type MileageIndex = {
  setupsByVehicle: Map<string, VehicleSetup[]>
  pricesByFuel: Map<string, FuelPrice[]>
}

const indexCache = new WeakMap<
  readonly VehicleSetup[],
  WeakMap<readonly FuelPrice[], MileageIndex>
>()

/**
 * Sorted per-car and per-fuel histories. Cached by array identity — the store
 * replaces arrays on every write — so screens can call it on every render.
 */
export function buildMileageIndex(
  vehicleSetups: readonly VehicleSetup[],
  fuelPrices: readonly FuelPrice[]
): MileageIndex {
  let byPrices = indexCache.get(vehicleSetups)
  if (!byPrices) {
    byPrices = new WeakMap()
    indexCache.set(vehicleSetups, byPrices)
  }
  const cached = byPrices.get(fuelPrices)
  if (cached) return cached
  const index = {
    setupsByVehicle: groupSorted(vehicleSetups, (s) => s.vehicleId),
    pricesByFuel: groupSorted(fuelPrices, (p) => p.fuelId),
  }
  byPrices.set(fuelPrices, index)
  return index
}

export type TripEstimate = {
  setup?: VehicleSetup
  fuelId?: string
  milesPerGallon?: number
  price?: FuelPrice
  /** Estimated cost; undefined when fuel economy or fuel price is missing. */
  cost?: number
}

export function estimateTrip(
  trip: Pick<Trip, 'vehicleId' | 'date' | 'distanceMiles'>,
  index: MileageIndex
): TripEstimate {
  const setup = effectiveEntry(
    index.setupsByVehicle.get(trip.vehicleId),
    trip.date
  )
  const fuelId = setup?.fuelId
  const milesPerGallon =
    setup?.milesPerGallon && setup.milesPerGallon > 0
      ? setup.milesPerGallon
      : undefined
  const price = fuelId
    ? effectiveEntry(index.pricesByFuel.get(fuelId), trip.date)
    : undefined
  const cost =
    milesPerGallon && price
      ? (trip.distanceMiles / milesPerGallon) * price.pricePerGallon
      : undefined
  return { setup, fuelId, milesPerGallon, price, cost }
}

// --- Periods -----------------------------------------------------------------

export type MileagePeriod = {
  kind: MileagePeriodKind
  start: moment.Moment
  end: moment.Moment
}

/**
 * The Day, Week, Month, or Service Year (Sep 1 – Aug 31) containing `anchor`.
 * Weeks start on `startOfWeek` (0 = Sunday … 6 = Saturday).
 */
export function periodContaining(
  kind: MileagePeriodKind,
  anchor: moment.MomentInput,
  startOfWeek = 0
): MileagePeriod {
  const day = moment(anchor).startOf('day')
  switch (kind) {
    case 'day':
      return { kind, start: day, end: day.clone().endOf('day') }
    case 'week': {
      const start = day
        .clone()
        .subtract((day.day() - startOfWeek + 7) % 7, 'days')
      return {
        kind,
        start,
        end: start.clone().add(6, 'days').endOf('day'),
      }
    }
    case 'month':
      return {
        kind,
        start: day.clone().startOf('month'),
        end: day.clone().endOf('month'),
      }
    case 'year': {
      const startYear = day.month() < 8 ? day.year() - 1 : day.year()
      const start = moment({ year: startYear, month: 8, day: 1 })
      return {
        kind,
        start,
        end: start.clone().add(1, 'year').subtract(1, 'day').endOf('day'),
      }
    }
  }
}

export function shiftPeriod(
  period: MileagePeriod,
  delta: number,
  startOfWeek = 0
): MileagePeriod {
  const unit = { day: 'days', week: 'weeks', month: 'months', year: 'years' }[
    period.kind
  ] as moment.unitOfTime.DurationConstructor
  return periodContaining(
    period.kind,
    period.start.clone().add(delta, unit),
    startOfWeek
  )
}

export const periodContainsDate = (period: MileagePeriod, date: string) =>
  date >= toDateKey(period.start) && date <= toDateKey(period.end)

// --- Trips -----------------------------------------------------------------

/** Newest date first; same-day trips newest-created first. */
export const compareTripsNewestFirst = (a: Trip, b: Trip) =>
  a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1

export function tripsInPeriod(
  trips: readonly Trip[],
  period: MileagePeriod
): Trip[] {
  const start = toDateKey(period.start)
  const end = toDateKey(period.end)
  return trips
    .filter((trip) => trip.date >= start && trip.date <= end)
    .sort(compareTripsNewestFirst)
}

export type VehicleSummary = {
  vehicleId: string
  distanceMiles: number
  tripCount: number
  cost?: number
}

export type MileageSummary = {
  distanceMiles: number
  tripCount: number
  /** Sum of the trips that have an estimate; undefined when none do. */
  cost?: number
  /** Some, but not all, trips have an estimated cost. */
  costIncomplete: boolean
  /** Ordered like `vehicles`; only cars with trips in the set. */
  byVehicle: VehicleSummary[]
}

export function summarizeTrips(
  trips: readonly Trip[],
  index: MileageIndex,
  vehicles: readonly Vehicle[]
): MileageSummary {
  const perVehicle = new Map<string, VehicleSummary>()
  let distanceMiles = 0
  let cost: number | undefined
  let costed = 0
  for (const trip of trips) {
    distanceMiles += trip.distanceMiles
    const estimate = estimateTrip(trip, index).cost
    const entry = perVehicle.get(trip.vehicleId) ?? {
      vehicleId: trip.vehicleId,
      distanceMiles: 0,
      tripCount: 0,
    }
    entry.distanceMiles += trip.distanceMiles
    entry.tripCount += 1
    if (estimate !== undefined) {
      costed += 1
      cost = (cost ?? 0) + estimate
      entry.cost = (entry.cost ?? 0) + estimate
    }
    perVehicle.set(trip.vehicleId, entry)
  }
  const order = new Map(vehicles.map((v, i) => [v.id, i]))
  const byVehicle = [...perVehicle.values()].sort(
    (a, b) =>
      (order.get(a.vehicleId) ?? Infinity) -
      (order.get(b.vehicleId) ?? Infinity)
  )
  return {
    distanceMiles,
    tripCount: trips.length,
    cost,
    costIncomplete: costed > 0 && costed < trips.length,
    byVehicle,
  }
}

/**
 * The car of the most recently logged trip, if still active; else the first
 * active car.
 */
export function defaultVehicleId(
  trips: readonly Trip[],
  vehicles: readonly Vehicle[]
): string | undefined {
  const active = new Set(vehicles.filter((v) => !v.archived).map((v) => v.id))
  let latest: Trip | undefined
  for (const trip of trips) {
    if (!active.has(trip.vehicleId)) continue
    if (!latest || trip.createdAt > latest.createdAt) latest = trip
  }
  return latest?.vehicleId ?? vehicles.find((v) => !v.archived)?.id
}

/**
 * The car's latest odometer end reading on or before `date`, to prefill the
 * next trip's start. Ignores `excludeTripId` (the trip being edited).
 */
export function latestOdometerMiles(
  trips: readonly Trip[],
  vehicleId: string,
  date: string,
  excludeTripId?: string
): number | undefined {
  let latest: Trip | undefined
  for (const trip of trips) {
    if (
      trip.vehicleId !== vehicleId ||
      trip.id === excludeTripId ||
      trip.odometerEndMiles === undefined ||
      trip.date > date
    )
      continue
    if (!latest || compareTripsNewestFirst(trip, latest) < 0) latest = trip
  }
  return latest?.odometerEndMiles
}

// --- Effective-dated edits ---------------------------------------------------

/**
 * How an edit to a fuel price or car setup applies: `starting` a date (earlier
 * trips keep the old value) or `correct` the value in effect today (a typo fix
 * that also changes the trips it covered).
 */
export type HistoryChangeMode = 'starting' | 'correct'

/**
 * Which history entry an edit writes: an existing entry to update in place
 * (`target`), or a new one effective from `effectiveFrom`.
 */
export function resolveHistoryWrite<T extends Dated & { id: string }>(
  sorted: readonly T[],
  mode: HistoryChangeMode,
  startingDate: string,
  today: string
): { target?: T; effectiveFrom: string } {
  if (mode === 'correct') {
    const target = effectiveEntry(sorted, today)
    return { target, effectiveFrom: target?.effectiveFrom ?? today }
  }
  return {
    target: sorted.find((entry) => entry.effectiveFrom === startingDate),
    effectiveFrom: startingDate,
  }
}
