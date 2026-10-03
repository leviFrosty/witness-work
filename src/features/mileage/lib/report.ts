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
  formatPeriodLabel,
  type MileageFormatter,
} from '@/features/mileage/lib/format'
import type { Fuel, Trip, Vehicle } from '@/types/mileage'

export type MileageReportInput = {
  period: MileagePeriod
  /** Trips in the period, newest first. */
  trips: Trip[]
  vehicles: Vehicle[]
  fuels: Fuel[]
  index: MileageIndex
  format: MileageFormatter
}

const vehicleName = (vehicles: Vehicle[], id: string) =>
  vehicles.find((v) => v.id === id)?.name ?? i18n.t('mileage.unknownCar')

/**
 * Plain-text report for Copy / Share: totals, per-car totals with more than one
 * car, and the trip list for every period shorter than a year.
 */
export function buildReportText({
  period,
  trips,
  vehicles,
  index,
  format,
}: MileageReportInput): string {
  const summary = summarizeTrips(trips, index, vehicles)
  const lines = [
    i18n.t('mileage.reportTitle'),
    formatPeriodLabel(period),
    '',
    `${i18n.t('mileage.distance')}: ${format.distance(summary.distanceMiles)}`,
    `${i18n.t('mileage.trips')}: ${summary.tripCount}`,
  ]
  if (summary.cost !== undefined)
    lines.push(
      `${i18n.t('mileage.estimatedCost')}: ${format.cost(summary.cost)}`
    )
  const multipleCars = summary.byVehicle.length > 1
  if (multipleCars) {
    lines.push('', `${i18n.t('mileage.byCar')}:`)
    for (const car of summary.byVehicle) {
      const parts = [
        format.distance(car.distanceMiles),
        i18n.t('mileage.tripCount' as TranslationKey, { count: car.tripCount }),
        car.cost !== undefined && format.cost(car.cost),
      ].filter(Boolean)
      lines.push(
        `${vehicleName(vehicles, car.vehicleId)}: ${parts.join(' · ')}`
      )
    }
  }
  if (period.kind !== 'year' && trips.length > 0) {
    lines.push('', `${i18n.t('mileage.trips')}:`)
    for (const trip of [...trips].reverse()) {
      const parts = [
        formatMonthDayCompact(fromDateKey(trip.date)),
        format.distance(trip.distanceMiles),
        multipleCars && vehicleName(vehicles, trip.vehicleId),
        trip.note?.replace(/\s+/g, ' ').trim(),
      ].filter(Boolean)
      lines.push(parts.join(' · '))
    }
  }
  return lines.join('\n')
}

/** Plain-text summary of one trip, for its Share and Copy actions. */
export function buildTripText(
  trip: Trip,
  vehicles: Vehicle[],
  index: MileageIndex,
  format: MileageFormatter
): string {
  const estimate = estimateTrip(trip, index)
  return [
    `${formatMonthDayCompact(fromDateKey(trip.date))} · ${vehicleName(vehicles, trip.vehicleId)}`,
    `${i18n.t('mileage.distance')}: ${format.distance(trip.distanceMiles)}${
      trip.roundTrip ? ` (${i18n.t('mileage.roundTrip')})` : ''
    }`,
    estimate.cost !== undefined &&
      `${i18n.t('mileage.estimatedCost')}: ${format.cost(estimate.cost)}`,
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

/** One row per trip, oldest first, in the user's display units. */
export function buildReportCsv({
  trips,
  vehicles,
  fuels,
  index,
  format,
}: MileageReportInput): string {
  const header = [
    i18n.t('date'),
    i18n.t('mileage.car'),
    i18n.t('mileage.odometerStart'),
    i18n.t('mileage.odometerEnd'),
    i18n.t('mileage.distance'),
    i18n.t('mileage.unit'),
    i18n.t('mileage.roundTrip'),
    i18n.t('note'),
    i18n.t('mileage.fuel'),
    `${i18n.t('mileage.fuelEconomy')} (${format.economySuffix})`,
    `${i18n.t('mileage.fuelPrice')} (${format.priceSuffix})`,
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
