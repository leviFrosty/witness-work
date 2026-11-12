import { LITRES_PER_US_GALLON } from '@/lib/mileage/units'
import type {
  Fuel,
  FuelPrice,
  MileageSnapshot,
  MileageTombstone,
} from '@/types/mileage'

export type PremadeFuelKey = 'gasoline' | 'diesel' | 'electric'

export const PREMADE_FUEL_KEYS: readonly PremadeFuelKey[] = [
  'gasoline',
  'diesel',
  'electric',
]

export const premadeFuelId = (key: PremadeFuelKey) => `premade-fuel-${key}`
export const premadeFuelPriceId = (key: PremadeFuelKey) =>
  `premade-fuel-price-${key}`

export const PREMADE_FUEL_STAMP = 1

export const PREMADE_FUEL_PRICE_FROM = '2026-01-01'

type RegionPrices = {
  currency: string
  gasoline: number
  diesel: number
  electricity: number
  perGallon?: true
}

export const PREMADE_FUEL_PRICES: Readonly<Record<string, RegionPrices>> = {
  US: {
    currency: 'USD',
    gasoline: 3.864,
    diesel: 5.125,
    electricity: 0.1819,
    perGallon: true,
  },
  CA: { currency: 'CAD', gasoline: 1.991, diesel: 2.598, electricity: 0.166 },
  MX: { currency: 'MXN', gasoline: 28.37, diesel: 26.825, electricity: 2.1 },
  BR: { currency: 'BRL', gasoline: 6.48, diesel: 7, electricity: 0.943 },
  GB: { currency: 'GBP', gasoline: 1.728, diesel: 1.986, electricity: 0.331 },
  IE: { currency: 'EUR', gasoline: 1.971, diesel: 2.137, electricity: 0.399 },
  DE: { currency: 'EUR', gasoline: 2.059, diesel: 2.278, electricity: 0.362 },
  FR: { currency: 'EUR', gasoline: 2.095, diesel: 2.371, electricity: 0.232 },
  ES: { currency: 'EUR', gasoline: 1.713, diesel: 1.893, electricity: 0.243 },
  IT: { currency: 'EUR', gasoline: 2.001, diesel: 2.238, electricity: 0.333 },
  NL: { currency: 'EUR', gasoline: 2.301, diesel: 2.461, electricity: 0.237 },
  BE: { currency: 'EUR', gasoline: 1.826, diesel: 2.373, electricity: 0.347 },
  AT: { currency: 'EUR', gasoline: 1.747, diesel: 2.148, electricity: 0.328 },
  PT: { currency: 'EUR', gasoline: 2.001, diesel: 2.206, electricity: 0.213 },
  FI: { currency: 'EUR', gasoline: 2.338, diesel: 2.54, electricity: 0.142 },
  CH: { currency: 'CHF', gasoline: 2.135, diesel: 2.41, electricity: 0.292 },
  PL: { currency: 'PLN', gasoline: 6.461, diesel: 7.844, electricity: 0.914 },
  SE: { currency: 'SEK', gasoline: 16.29, diesel: 22.44, electricity: 2.72 },
  NO: { currency: 'NOK', gasoline: 28.19, diesel: 28.03, electricity: 1.972 },
  DK: { currency: 'DKK', gasoline: 17.857, diesel: 20.157, electricity: 2.062 },
  JP: { currency: 'JPY', gasoline: 170.1, diesel: 159.7, electricity: 32.795 },
  KR: {
    currency: 'KRW',
    gasoline: 1855.66,
    diesel: 1842.06,
    electricity: 170.844,
  },
  TW: { currency: 'TWD', gasoline: 32.7, diesel: 29.9, electricity: 3.227 },
  CN: { currency: 'CNY', gasoline: 9.537, diesel: 8.582, electricity: 0.532 },
  VN: { currency: 'VND', gasoline: 23965, diesel: 29155, electricity: 2050 },
  PH: { currency: 'PHP', gasoline: 84.2, diesel: 94.5, electricity: 12.951 },
  IN: { currency: 'INR', gasoline: 108.65, diesel: 98.1, electricity: 6.86 },
  AU: { currency: 'AUD', gasoline: 2.35, diesel: 2.63, electricity: 0.39 },
  NZ: { currency: 'NZD', gasoline: 3.693, diesel: 3.194, electricity: 0.408 },
  ZA: { currency: 'ZAR', gasoline: 29.81, diesel: 33.62, electricity: 4.524 },
  KE: { currency: 'KES', gasoline: 225.5, diesel: 226.43, electricity: 26.24 },
  RW: { currency: 'RWF', gasoline: 2938, diesel: 2927, electricity: 361.09 },
  ZM: { currency: 'ZMW', gasoline: 33.06, diesel: 34.45, electricity: 0.524 },
  UA: { currency: 'UAH', gasoline: 91.69, diesel: 106.47, electricity: 4.32 },
  RU: { currency: 'RUB', gasoline: 70.61, diesel: 79.38, electricity: 6.579 },
  CO: {
    currency: 'COP',
    gasoline: 4196.64,
    diesel: 2990.43,
    electricity: 822.139,
  },
  CL: {
    currency: 'CLP',
    gasoline: 1524.33,
    diesel: 1527.17,
    electricity: 253.904,
  },
  PE: { currency: 'PEN', gasoline: 5.781, diesel: 6.591, electricity: 0.635 },
}

const FALLBACK_CURRENCY = 'USD'

const threeFigures = (value: number) => Number(value.toPrecision(3))

export function premadeFuelPrice(
  key: PremadeFuelKey,
  region?: string | null,
  currency?: string | null
): number | undefined {
  const prices = region ? PREMADE_FUEL_PRICES[region.toUpperCase()] : undefined
  const shown = (currency || FALLBACK_CURRENCY).toUpperCase()
  if (!prices || prices.currency !== shown) return undefined
  if (key === 'electric') return threeFigures(prices.electricity)
  const price = threeFigures(prices[key])
  return prices.perGallon ? price : price * LITRES_PER_US_GALLON
}

const OTHER_NAMES: Record<PremadeFuelKey, readonly string[]> = {
  gasoline: ['gasoline', 'gas', 'petrol', 'regular', 'unleaded'],
  diesel: ['diesel'],
  electric: ['electric', 'electricity', 'ev'],
}

const normalized = (name: string) => name.trim().toLocaleLowerCase()

const premadeKeyOfId = (id: string) =>
  PREMADE_FUEL_KEYS.find(
    (key) => premadeFuelId(key) === id || premadeFuelPriceId(key) === id
  )

export const premadeFuelKey = (
  fuel: Pick<Fuel, 'id'> | undefined
): PremadeFuelKey | undefined =>
  fuel && PREMADE_FUEL_KEYS.find((key) => premadeFuelId(key) === fuel.id)

export const isUntouchedPremadeFuelRecord = (record: {
  id: string
  updatedAt?: number
}) =>
  record.updatedAt === PREMADE_FUEL_STAMP &&
  premadeKeyOfId(record.id) !== undefined

export type PremadeFuelContext = {
  region?: string | null
  currency?: string | null
  names: Record<PremadeFuelKey, string>
}

export function ensurePremadeFuels(
  state: MileageSnapshot,
  { region, currency, names }: PremadeFuelContext
): Partial<MileageSnapshot> | null {
  const tombstoned = new Set(state.deletedMileageRecords.map((t) => t.id))
  const added: Fuel[] = []
  const addedPrices: FuelPrice[] = []
  const tombstones: MileageTombstone[] = []
  const retired = new Set<string>()

  for (const key of PREMADE_FUEL_KEYS) {
    const id = premadeFuelId(key)
    const priceId = premadeFuelPriceId(key)
    const existing = state.fuels.find((fuel) => fuel.id === id)
    const taken = new Set([normalized(names[key]), ...OTHER_NAMES[key]])
    const hasOwn = state.fuels.some(
      (fuel) => fuel.id !== id && taken.has(normalized(fuel.name))
    )

    if (existing) {
      const asMade =
        isUntouchedPremadeFuelRecord(existing) &&
        state.fuelPrices.every(
          (price) =>
            price.fuelId !== id ||
            (price.id === priceId && isUntouchedPremadeFuelRecord(price))
        )
      const inUse = state.vehicleSetups.some((setup) => setup.fuelId === id)
      if (!hasOwn || !asMade || inUse) continue
      retired.add(id)
      tombstones.push({ id, deletedAt: PREMADE_FUEL_STAMP })
      if (state.fuelPrices.some((price) => price.id === priceId))
        tombstones.push({ id: priceId, deletedAt: PREMADE_FUEL_STAMP })
      continue
    }
    if (tombstoned.has(id)) continue
    if (hasOwn) {
      tombstones.push({ id, deletedAt: PREMADE_FUEL_STAMP })
      continue
    }

    added.push({
      id,
      name: names[key],
      ...(key === 'electric' && { unit: 'kWh' as const }),
      createdAt: PREMADE_FUEL_STAMP,
      updatedAt: PREMADE_FUEL_STAMP,
    })
    const price = premadeFuelPrice(key, region, currency)
    if (
      price !== undefined &&
      !tombstoned.has(priceId) &&
      !state.fuelPrices.some((p) => p.id === priceId)
    )
      addedPrices.push({
        id: priceId,
        fuelId: id,
        effectiveFrom: PREMADE_FUEL_PRICE_FROM,
        pricePerGallon: price,
        updatedAt: PREMADE_FUEL_STAMP,
      })
  }

  if (added.length === 0 && tombstones.length === 0) return null
  const changes: Partial<MileageSnapshot> = {}
  if (added.length > 0 || retired.size > 0)
    changes.fuels = [
      ...added,
      ...state.fuels.filter((fuel) => !retired.has(fuel.id)),
    ]
  if (addedPrices.length > 0 || retired.size > 0)
    changes.fuelPrices = [
      ...state.fuelPrices.filter((price) => !retired.has(price.fuelId)),
      ...addedPrices,
    ]
  if (tombstones.length > 0)
    changes.deletedMileageRecords = [
      ...state.deletedMileageRecords,
      ...tombstones,
    ]
  return changes
}

export const hasOwnMileageRecords = (snapshot: MileageSnapshot): boolean =>
  snapshot.vehicles.length > 0 ||
  snapshot.vehicleSetups.length > 0 ||
  snapshot.trips.length > 0 ||
  snapshot.deletedMileageRecords.length > 0 ||
  snapshot.fuels.some((fuel) => !isUntouchedPremadeFuelRecord(fuel)) ||
  snapshot.fuelPrices.some((price) => !isUntouchedPremadeFuelRecord(price))
