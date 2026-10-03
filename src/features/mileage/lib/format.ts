import { getLocales } from 'expo-localization'
import i18n from '@/lib/locales'
import { formatDate, formatMonthDayCompact } from '@/lib/dates'
import {
  autoDistanceUnit,
  autoFuelEconomyUnit,
  formatCurrency,
  formatFuelPrice,
  formatNumber,
  fuelVolumeUnit,
  milesToDistance,
  mpgToEconomy,
  pricePerGallonToDisplay,
} from '@/lib/mileage/units'
import type { MileagePeriod } from '@/lib/mileage/calc'
import type { DistanceUnit, FuelEconomyUnit } from '@/types/mileage'

export type MileageUnits = {
  distanceUnit: DistanceUnit
  economyUnit: FuelEconomyUnit
  currency?: string
}

/** Applies Auto (device region) to unset unit preferences. */
export function resolveMileageUnits(prefs: {
  distanceUnit?: DistanceUnit
  fuelEconomyUnit?: FuelEconomyUnit
}): MileageUnits {
  const locale = getLocales()[0]
  return {
    distanceUnit: prefs.distanceUnit ?? autoDistanceUnit(locale?.regionCode),
    economyUnit:
      prefs.fuelEconomyUnit ?? autoFuelEconomyUnit(locale?.regionCode),
    currency: locale?.currencyCode ?? undefined,
  }
}

/** Display helpers for canonical (miles / US mpg / per-gallon) values. */
export function createMileageFormatter(units: MileageUnits) {
  const distanceSuffix = i18n.t(`mileage.units.${units.distanceUnit}`)
  const economySuffix = i18n.t(`mileage.units.${units.economyUnit}`)
  const priceSuffix = i18n.t(
    `mileage.units.per_${fuelVolumeUnit(units.economyUnit)}`
  )
  return {
    ...units,
    distanceSuffix,
    economySuffix,
    priceSuffix,
    distance: (miles: number) =>
      `${formatNumber(milesToDistance(miles, units.distanceUnit))} ${distanceSuffix}`,
    economy: (mpg: number) =>
      `${formatNumber(mpgToEconomy(mpg, units.economyUnit))} ${economySuffix}`,
    cost: (amount: number) => formatCurrency(amount, units.currency),
    price: (pricePerGallon: number) =>
      `${formatFuelPrice(
        pricePerGallonToDisplay(pricePerGallon, units.economyUnit),
        units.currency
      )}${priceSuffix}`,
  }
}

export type MileageFormatter = ReturnType<typeof createMileageFormatter>

export function formatPeriodLabel(period: MileagePeriod): string {
  switch (period.kind) {
    case 'day':
      return formatDate(period.start)
    case 'week':
      return `${formatMonthDayCompact(period.start)} – ${formatMonthDayCompact(period.end)}`
    case 'month':
      return period.start.format('MMMM YYYY')
    case 'year':
      return i18n.t('mileage.serviceYearRange', {
        start: period.start.year(),
        end: period.start.year() + 1,
      })
  }
}
