import moment from 'moment'
import { getServiceYearFromDate, serviceYearBounds } from '@/lib/serviceYear'
import type {
  FuelPrice,
  MileagePeriodKind,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'

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

export type MileagePeriod = {
  kind: MileagePeriodKind
  start: moment.Moment
  end: moment.Moment
}

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
      const { start, end } = serviceYearBounds(getServiceYearFromDate(day))
      return { kind, start, end }
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

export type MileageBucket = {
  start: string

  kind: 'day' | 'month'
  distanceMiles: number

  byVehicle: Record<string, number>
}

export function bucketTrips(
  period: MileagePeriod,
  trips: readonly Trip[]
): MileageBucket[] {
  if (period.kind === 'day') return []
  const kind = period.kind === 'year' ? 'month' : 'day'
  const buckets: MileageBucket[] = []
  for (
    const cursor = period.start.clone();
    cursor.isSameOrBefore(period.end, 'day');
    cursor.add(1, kind)
  ) {
    buckets.push({
      start: toDateKey(cursor),
      kind,
      distanceMiles: 0,
      byVehicle: {},
    })
  }
  const end = toDateKey(period.end)
  for (const trip of trips) {
    if (trip.date < buckets[0].start || trip.date > end) continue

    let index = buckets.length - 1
    while (buckets[index].start > trip.date) index--
    const bucket = buckets[index]
    bucket.distanceMiles += trip.distanceMiles
    bucket.byVehicle[trip.vehicleId] =
      (bucket.byVehicle[trip.vehicleId] ?? 0) + trip.distanceMiles
  }
  return buckets
}

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

  cost?: number

  costIncomplete: boolean

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

export type HistoryChangeMode = 'starting' | 'correct'

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
