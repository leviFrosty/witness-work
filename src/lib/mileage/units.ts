import type { DistanceUnit, FuelEconomyUnit } from '@/types/mileage'

/**
 * Mileage is stored in canonical units — miles, US mpg, price per US gallon —
 * and converted here for display and input. See
 * `docs/mileage-tracking-prd.md`.
 */
export const KM_PER_MILE = 1.609344
export const LITRES_PER_US_GALLON = 3.785411784
export const LITRES_PER_UK_GALLON = 4.54609

/**
 * Regions that drive in miles: the US and its territories, the UK, Liberia,
 * Myanmar.
 */
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
/** Regions that quote fuel economy as km per litre rather than L/100 km. */
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

/** L/100 km ↔ US mpg is its own inverse: both are this constant ÷ the other. */
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

/** Fuel is priced per US gallon only alongside US mpg; per litre otherwise. */
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

/**
 * Parses a user-typed decimal, accepting either `.` or `,` as the separator.
 * Returns `undefined` for blank or invalid input.
 */
export function parseDecimal(text: string): number | undefined {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.')
  if (!normalized) return undefined
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === '.') return undefined
  const value = Number(normalized)
  return Number.isFinite(value) ? value : undefined
}

/** Rounds for display and strips trailing zeros: 12.50 → "12.5". */
export function formatNumber(value: number, maxDecimals = 1): string {
  const factor = 10 ** maxDecimals
  const rounded = Math.round(value * factor) / factor
  try {
    return rounded.toLocaleString(undefined, {
      maximumFractionDigits: maxDecimals,
    })
  } catch {
    return String(rounded)
  }
}

/** Plain value for an input field: no grouping separators. */
export function formatInputNumber(value: number, maxDecimals = 1): string {
  const factor = 10 ** maxDecimals
  return String(Math.round(value * factor) / factor)
}

export function formatCurrency(amount: number, currency?: string | null) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount)
  } catch {
    return amount.toFixed(2)
  }
}

/** Currency with up to three decimals, for per-unit fuel prices ($3.499). */
export function formatFuelPrice(amount: number, currency?: string | null) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    }).format(amount)
  } catch {
    return amount.toFixed(3)
  }
}
