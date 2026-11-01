import type { DistanceUnit, FuelEconomyUnit } from '@/types/mileage'
import { parseDecimalInput } from '@/lib/digits'
import {
  formatNumber as formatAppNumber,
  formatPlainNumber,
} from '@/lib/numbers'

export const KM_PER_MILE = 1.609344
export const LITRES_PER_US_GALLON = 3.785411784
export const LITRES_PER_UK_GALLON = 4.54609

const MILE_REGIONS = new Set([
  'US',
  'AS',
  'GU',
  'MP',
  'PR',
  'VI',
  'UM',
  'GB',
  'LR',
  'MM',
])
const US_GALLON_REGIONS = new Set(['US', 'AS', 'GU', 'MP', 'PR', 'VI', 'UM'])

const KM_PER_LITRE_REGIONS = new Set([
  'JP',
  'KR',
  'TW',
  'IN',
  'BD',
  'PK',
  'NP',
  'LK',
  'ID',
  'PH',
  'TH',
  'VN',
  'MX',
  'BR',
  'AR',
  'CO',
  'CL',
  'PE',
  'VE',
  'EC',
  'BO',
  'PY',
  'UY',
])

export const DISTANCE_UNITS: DistanceUnit[] = ['mi', 'km']
export const FUEL_ECONOMY_UNITS: FuelEconomyUnit[] = [
  'mpgUS',
  'mpgUK',
  'lPer100km',
  'kmPerL',
]

export function autoDistanceUnit(region?: string | null): DistanceUnit {
  return region && MILE_REGIONS.has(region.toUpperCase()) ? 'mi' : 'km'
}

export function autoFuelEconomyUnit(region?: string | null): FuelEconomyUnit {
  const code = region?.toUpperCase()
  if (!code) return 'mpgUS'
  if (US_GALLON_REGIONS.has(code)) return 'mpgUS'
  if (code === 'GB') return 'mpgUK'
  if (KM_PER_LITRE_REGIONS.has(code)) return 'kmPerL'
  return 'lPer100km'
}

export const milesToDistance = (miles: number, unit: DistanceUnit) =>
  unit === 'km' ? miles * KM_PER_MILE : miles

export const distanceToMiles = (value: number, unit: DistanceUnit) =>
  unit === 'km' ? value / KM_PER_MILE : value

const L100KM_X_MPG = (100 * LITRES_PER_US_GALLON) / KM_PER_MILE

export function mpgToEconomy(mpg: number, unit: FuelEconomyUnit): number {
  switch (unit) {
    case 'mpgUS':
      return mpg
    case 'mpgUK':
      return (mpg * LITRES_PER_UK_GALLON) / LITRES_PER_US_GALLON
    case 'lPer100km':
      return L100KM_X_MPG / mpg
    case 'kmPerL':
      return (mpg * KM_PER_MILE) / LITRES_PER_US_GALLON
  }
}

export function economyToMpg(value: number, unit: FuelEconomyUnit): number {
  switch (unit) {
    case 'mpgUS':
      return value
    case 'mpgUK':
      return (value * LITRES_PER_US_GALLON) / LITRES_PER_UK_GALLON
    case 'lPer100km':
      return L100KM_X_MPG / value
    case 'kmPerL':
      return (value * LITRES_PER_US_GALLON) / KM_PER_MILE
  }
}

export const fuelVolumeUnit = (unit: FuelEconomyUnit): 'gallon' | 'litre' =>
  unit === 'mpgUS' ? 'gallon' : 'litre'

export const pricePerGallonToDisplay = (
  pricePerGallon: number,
  unit: FuelEconomyUnit
) =>
  fuelVolumeUnit(unit) === 'gallon'
    ? pricePerGallon
    : pricePerGallon / LITRES_PER_US_GALLON

export const displayToPricePerGallon = (
  price: number,
  unit: FuelEconomyUnit
) => (fuelVolumeUnit(unit) === 'gallon' ? price : price * LITRES_PER_US_GALLON)

export const parseDecimal = parseDecimalInput

export function formatNumber(value: number, maxDecimals = 1): string {
  const factor = 10 ** maxDecimals
  const rounded = Math.round(value * factor) / factor
  return formatAppNumber(rounded, { maximumFractionDigits: maxDecimals })
}

export function formatInputNumber(value: number, maxDecimals = 1): string {
  const factor = 10 ** maxDecimals
  return String(Math.round(value * factor) / factor)
}

export function formatEditableNumber(value: number, maxDecimals = 1): string {
  const factor = 10 ** maxDecimals
  return formatPlainNumber(Math.round(value * factor) / factor)
}

const currencyCode = (currency?: string | null) => currency || 'USD'

export function formatCurrency(amount: number, currency?: string | null) {
  try {
    return formatAppNumber(amount, {
      style: 'currency',
      currency: currencyCode(currency),
    })
  } catch {
    return formatAppNumber(amount, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
}

export function formatFuelPrice(amount: number, currency?: string | null) {
  try {
    return formatAppNumber(amount, {
      style: 'currency',
      currency: currencyCode(currency),
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    })
  } catch {
    return formatAppNumber(amount, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    })
  }
}
