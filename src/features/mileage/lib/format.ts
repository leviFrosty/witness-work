import { getLocales } from 'expo-localization'
import i18n from '@/lib/locales'
import { formatDate, formatMonthDayCompact, formatDisplay } from '@/lib/dates'
import {
  autoDistanceUnit,
  autoFuelEconomyUnit,
  efficiencyUnit,
  formatCurrency,
  formatFuelPrice,
  formatNumber,
  fuelPriceUnit,
  milesToDistance,
  mpgToEconomy,
  pricePerGallonToDisplay,
} from '@/lib/mileage/units'
import type { MileagePeriod } from '@/lib/mileage/calc'
import type { DistanceUnit, FuelEconomyUnit, FuelUnit } from '@/types/mileage'

export type MileageUnits = {
  distanceUnit: DistanceUnit
  economyUnit: FuelEconomyUnit
  currency?: string
}

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

export function createMileageFormatter(units: MileageUnits) {
  const distanceSuffix = i18n.t(`mileage.units.${units.distanceUnit}`)
  const economySuffixFor = (fuelUnit?: FuelUnit) =>
    i18n.t(`mileage.units.${efficiencyUnit(units.economyUnit, fuelUnit)}`)
  const priceSuffixFor = (fuelUnit?: FuelUnit) =>
    i18n.t(`mileage.units.per_${fuelPriceUnit(units.economyUnit, fuelUnit)}`)
  return {
    ...units,
    distanceSuffix,
    economySuffix: economySuffixFor(),
    priceSuffix: priceSuffixFor(),
    economySuffixFor,
    priceSuffixFor,
    distance: (miles: number) =>
      i18n.t(`mileage.unitValues.${units.distanceUnit}`, {
        value: formatNumber(milesToDistance(miles, units.distanceUnit)),
      }),
    economy: (mpg: number, fuelUnit?: FuelUnit) =>
      i18n.t(
        `mileage.unitValues.${efficiencyUnit(units.economyUnit, fuelUnit)}`,
        {
          value: formatNumber(mpgToEconomy(mpg, units.economyUnit, fuelUnit)),
        }
      ),
    cost: (amount: number) => formatCurrency(amount, units.currency),
    price: (pricePerGallon: number, fuelUnit?: FuelUnit) =>
      i18n.t(
        `mileage.unitValues.per_${fuelPriceUnit(units.economyUnit, fuelUnit)}`,
        {
          value: formatFuelPrice(
            pricePerGallonToDisplay(
              pricePerGallon,
              units.economyUnit,
              fuelUnit
            ),
            units.currency
          ),
        }
      ),
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
      return formatDisplay(period.start, 'MMMM YYYY')
    case 'year':
      return i18n.t('mileage.serviceYearRange', {
        start: period.start.year(),
        end: period.start.year() + 1,
      })
  }
}
