import i18n, { type TranslationKey } from '@/lib/locales'
import { formatMonthDayCompact } from '@/lib/dates'
import {
  estimateTrip,
  fromDateKey,
  summarizeTrips,
  type MileageIndex,
  type MileagePeriod,
} from '@/lib/mileage/calc'
import {
  formatInputNumber,
  milesToDistance,
  mpgToEconomy,
  pricePerGallonToDisplay,
} from '@/lib/mileage/units'
import {
  EVERYONE,
  ME,
  type MileagePeople,
  type PersonFilter,
} from '@/lib/mileage/people'
import {
  formatPeriodLabel,
  type MileageFormatter,
} from '@/features/mileage/lib/format'
import { personExportName } from '@/features/mileage/lib/personLabel'
import type { Fuel, Trip, Vehicle } from '@/types/mileage'

/** Who logged the trips in a report or export, on Shared Cars. */
export type ReportPeople = {
  people: MileagePeople
  /** The User's own name, for the trips they logged. */
  ownName?: string
}

export type MileageReportInput = {
  period: MileagePeriod
  /** Trips in the period, newest first. */
  trips: Trip[]
  vehicles: Vehicle[]
  fuels: Fuel[]
  index: MileageIndex
  format: MileageFormatter
  /** Who logged each trip, once the User is on a Shared Car. */
  sharing?: ReportPeople & {
    /** Whose trips these are: the Mileage screen's person filter. */
    filter: PersonFilter
  }
}

const vehicleName = (vehicles: Vehicle[], id: string) =>
  vehicles.find((v) => v.id === id)?.name ?? i18n.t('mileage.unknownCar')

/**
 * The User as a report names them, the same on every trip of theirs: their own
 * name (`ownName`, their Buddy Card's), else the one they share on their Shared
 * Cars, else "Me".
 */
const selfName = ({ people, ownName }: ReportPeople) =>
  personExportName({ me: true, name: '' }, ownName || people.nameOnCars)

/**
 * Who logged `trip`, as a report names them; undefined on the User's own cars,
 * and on a Shared Car's trip that doesn't say.
 */
function loggedByName(trip: Trip, sharing: ReportPeople): string | undefined {
  const { people } = sharing
  if (people.spaceOf(trip) === undefined) return undefined
  if (people.mine(trip)) return selfName(sharing)
  const person = people.loggedBy(trip)
  return person && personExportName(person)
}

/** Whose trips a filtered report holds (Me, or one person), by name. */
function filteredPersonName(
  sharing: ReportPeople & { filter: PersonFilter }
): string | undefined {
  if (sharing.filter === EVERYONE) return undefined
  if (sharing.filter === ME) return selfName(sharing)
  const person = sharing.people.others.find((p) => p.key === sharing.filter)
  return person && personExportName(person)
}

/**
 * Plain-text report for Copy / Share: totals, per-car totals with more than one
 * car, and the trip list for every period shorter than a year. Filtered to the
 * User or one person, it says whose trips these are; showing everyone's, each
 * trip someone else logged on a Shared Car names them.
 */
export function buildReportText({
  period,
  trips,
  vehicles,
  index,
  format,
  sharing,
}: MileageReportInput): string {
  const summary = summarizeTrips(trips, index, vehicles)
  const person = sharing && filteredPersonName(sharing)
  const lines = [
    i18n.t('mileage.reportTitle'),
    formatPeriodLabel(period),
    ...(person ? [i18n.t('mileage.loggedByLine', { name: person })] : []),
    '',
    i18n.t('mileage.distanceLine', {
      value: format.distance(summary.distanceMiles),
    }),
    i18n.t('mileage.tripsLine', { value: summary.tripCount }),
  ]
  if (summary.cost !== undefined)
    lines.push(
      i18n.t('mileage.estimatedCostLine', { value: format.cost(summary.cost) })
    )
  const multipleCars = summary.byVehicle.length > 1
  if (multipleCars) {
    lines.push('', i18n.t('mileage.byCarHeading'))
    for (const car of summary.byVehicle) {
      const parts = [
        format.distance(car.distanceMiles),
        i18n.t('mileage.tripCount' as TranslationKey, { count: car.tripCount }),
        car.cost !== undefined && format.cost(car.cost),
      ].filter(Boolean)
      lines.push(
        i18n.t('mileage.carLine', {
          car: vehicleName(vehicles, car.vehicleId),
          value: parts.join(' · '),
        })
      )
    }
  }
  if (period.kind !== 'year' && trips.length > 0) {
    lines.push('', i18n.t('mileage.tripsHeading'))
    const nameOthers = sharing?.filter === EVERYONE
    for (const trip of [...trips].reverse()) {
      const author = nameOthers ? sharing.people.loggedBy(trip) : undefined
      const parts = [
        formatMonthDayCompact(fromDateKey(trip.date)),
        format.distance(trip.distanceMiles),
        multipleCars && vehicleName(vehicles, trip.vehicleId),
        author && !author.me && personExportName(author),
        trip.note?.replace(/\s+/g, ' ').trim(),
      ].filter(Boolean)
      lines.push(parts.join(' · '))
    }
  }
  return lines.join('\n')
}

/**
 * Plain-text summary of one trip, for its Share and Copy actions. A trip on a
 * Shared Car says who logged it.
 */
export function buildTripText(
  trip: Trip,
  vehicles: Vehicle[],
  index: MileageIndex,
  format: MileageFormatter,
  sharing?: ReportPeople
): string {
  const estimate = estimateTrip(trip, index)
  const author = sharing && loggedByName(trip, sharing)
  return [
    `${formatMonthDayCompact(fromDateKey(trip.date))} · ${vehicleName(vehicles, trip.vehicleId)}`,
    i18n.t(
      trip.roundTrip ? 'mileage.distanceRoundTripLine' : 'mileage.distanceLine',
      { value: format.distance(trip.distanceMiles) }
    ),
    author && i18n.t('mileage.loggedByLine', { name: author }),
    estimate.cost !== undefined &&
      i18n.t('mileage.estimatedCostLine', {
        value: format.cost(estimate.cost),
      }),
    trip.note,
  ]
    .filter(Boolean)
    .join('\n')
}

/** RFC 4180 field: quoted when it holds a comma, quote, or line break. */
export function csvField(value: string | number | undefined): string {
  if (value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * One row per trip, oldest first, in the user's display units. With a trip on a
 * Shared Car among them, a Logged By column follows the car: every trip of the
 * User's (on their own cars or a Shared Car) by one name, others' by the name
 * they share.
 */
export function buildReportCsv({
  trips,
  vehicles,
  fuels,
  index,
  format,
  sharing,
}: MileageReportInput): string {
  const loggedBy =
    sharing && trips.some((trip) => sharing.people.spaceOf(trip) !== undefined)
      ? (trip: Trip) =>
          sharing.people.spaceOf(trip) === undefined
            ? selfName(sharing)
            : loggedByName(trip, sharing)
      : undefined
  const header = [
    i18n.t('date'),
    i18n.t('mileage.car'),
    ...(loggedBy ? [i18n.t('mileage.loggedBy')] : []),
    i18n.t('mileage.odometerStart'),
    i18n.t('mileage.odometerEnd'),
    i18n.t('mileage.distance'),
    i18n.t('mileage.unit'),
    i18n.t('mileage.roundTrip'),
    i18n.t('note'),
    i18n.t('mileage.fuel'),
    i18n.t('mileage.fuelEconomyWithUnit', { unit: format.economySuffix }),
    i18n.t('mileage.fuelPriceWithUnit', { unit: format.priceSuffix }),
    i18n.t('mileage.estimatedCost'),
  ]
  const distance = (miles: number | undefined) =>
    miles === undefined
      ? undefined
      : formatInputNumber(milesToDistance(miles, format.distanceUnit), 2)
  const rows = [...trips].reverse().map((trip) => {
    const estimate = estimateTrip(trip, index)
    return [
      trip.date,
      vehicleName(vehicles, trip.vehicleId),
      ...(loggedBy ? [loggedBy(trip)] : []),
      distance(trip.odometerStartMiles),
      distance(trip.odometerEndMiles),
      distance(trip.distanceMiles),
      format.distanceSuffix,
      trip.roundTrip ? i18n.t('yes') : i18n.t('no'),
      trip.note,
      fuels.find((f) => f.id === estimate.fuelId)?.name,
      estimate.milesPerGallon &&
        formatInputNumber(
          mpgToEconomy(estimate.milesPerGallon, format.economyUnit),
          2
        ),
      estimate.price &&
        formatInputNumber(
          pricePerGallonToDisplay(
            estimate.price.pricePerGallon,
            format.economyUnit
          ),
          3
        ),
      estimate.cost !== undefined ? formatInputNumber(estimate.cost, 2) : '',
    ].map((value) => csvField(value || value === 0 ? value : undefined))
  })
  return [header.map(csvField), ...rows]
    .map((row) => row.join(','))
    .join('\r\n')
}
