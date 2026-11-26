import * as Location from 'expo-location'
import { Platform } from 'react-native'
import apis from '@/constants/apis'
import { isKnownOffline } from '@/lib/http/online'
import { request } from '@/lib/http/request'
import type { Address, Coordinate } from '@/types/contact'

const REVERSE_GEOCODE_TIMEOUT_MS = 8_000

const STREET_FIRST_COUNTRIES = new Set([
  'AR',
  'AT',
  'BE',
  'BG',
  'BO',
  'BR',
  'CH',
  'CL',
  'CO',
  'CR',
  'CZ',
  'DE',
  'DK',
  'EC',
  'EE',
  'ES',
  'FI',
  'GR',
  'HR',
  'HU',
  'IS',
  'IT',
  'LT',
  'LV',
  'MX',
  'NL',
  'NO',
  'PE',
  'PL',
  'PT',
  'PY',
  'RO',
  'RS',
  'RU',
  'SE',
  'SI',
  'SK',
  'TR',
  'UA',
  'UY',
  'VE',
])

export type ReverseGeocodeResult = {
  address: Address
  formattedAddress: string
}

export type HereReverseGeocodeAddress = {
  label: string
  houseNumber?: string
  street?: string
  district?: string
  city?: string
  state?: string
  stateCode?: string
  postalCode?: string
  countryCode?: string
  countryName?: string
}

const clean = (value?: string | null): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function hasAddressContent(address?: Address | null): boolean {
  if (!address) return false
  return Boolean(
    clean(address.line1) ||
      clean(address.line2) ||
      clean(address.city) ||
      clean(address.state) ||
      clean(address.zip) ||
      clean(address.country)
  )
}

export function formatStreetLine({
  street,
  streetNumber,
  hint,
  isoCountryCode,
}: {
  street?: string | null
  streetNumber?: string | null
  hint?: string | null
  isoCountryCode?: string | null
}): string | undefined {
  const cleanStreet = clean(street)
  const cleanNumber = clean(streetNumber)
  if (!cleanStreet) return cleanNumber
  if (!cleanNumber) return cleanStreet

  const normalizedHint = clean(hint)?.toLowerCase()
  const lowerStreet = cleanStreet.toLowerCase()
  const lowerNumber = cleanNumber.toLowerCase()
  if (normalizedHint) {
    if (
      normalizedHint.includes(`${lowerStreet} ${lowerNumber}`) ||
      normalizedHint.includes(`${lowerStreet}, ${lowerNumber}`)
    ) {
      return `${cleanStreet} ${cleanNumber}`
    }
    if (
      normalizedHint.includes(`${lowerNumber} ${lowerStreet}`) ||
      normalizedHint.includes(`${lowerNumber}, ${lowerStreet}`)
    ) {
      return `${cleanNumber} ${cleanStreet}`
    }
  }

  const country = clean(isoCountryCode)?.toUpperCase()
  if (country && STREET_FIRST_COUNTRIES.has(country)) {
    return `${cleanStreet} ${cleanNumber}`
  }
  return `${cleanNumber} ${cleanStreet}`
}

function buildFormattedAddress(address: Address): string {
  const region = [clean(address.state), clean(address.zip)]
    .filter(Boolean)
    .join(' ')
  const locality = [clean(address.city), region || undefined]
    .filter(Boolean)
    .join(', ')
  return [
    clean(address.line1),
    clean(address.line2),
    locality || undefined,
    clean(address.country),
  ]
    .filter(Boolean)
    .join(', ')
}

export function formatPinAddressParts(address: Address): {
  primary: string
  secondary?: string
} {
  const line1 = clean(address.line1)
  const city = clean(address.city)
  const state = clean(address.state)
  const zip = clean(address.zip)
  const country = clean(address.country)

  const locality = [city, [state, zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')

  if (line1) {
    const secondary = [locality || undefined, country]
      .filter(Boolean)
      .join(', ')
    return { primary: line1, ...(secondary ? { secondary } : {}) }
  }
  if (locality) {
    return { primary: locality, ...(country ? { secondary: country } : {}) }
  }
  return { primary: country ?? '' }
}

export function addressFromGeocodedPlace(
  place: Location.LocationGeocodedAddress
): ReverseGeocodeResult | null {
  const hint = clean(place.formattedAddress) ?? clean(place.name)
  const line1 = formatStreetLine({
    street: place.street,
    streetNumber: place.streetNumber,
    hint,
    isoCountryCode: place.isoCountryCode,
  })
  const city = clean(place.city) ?? clean(place.subregion)
  const state = clean(place.region)
  const zip = clean(place.postalCode)
  const country = clean(place.country)

  const name = clean(place.name)
  const fallbackLine1 =
    !line1 &&
    name &&
    name !== zip &&
    name !== city &&
    name !== state &&
    name !== country
      ? name
      : undefined

  const address: Address = {}
  const resolvedLine1 = line1 ?? fallbackLine1
  if (resolvedLine1) address.line1 = resolvedLine1
  if (city) address.city = city
  if (state) address.state = state
  if (zip) address.zip = zip
  if (country) address.country = country

  if (!hasAddressContent(address)) return null

  const formattedAddress =
    clean(place.formattedAddress) ?? buildFormattedAddress(address)
  return { address, formattedAddress }
}

export function addressFromHereReverseGeocode(
  raw: HereReverseGeocodeAddress | null | undefined
): ReverseGeocodeResult | null {
  if (!raw || typeof raw.label !== 'string' || !raw.label.trim()) return null

  const line1 = formatStreetLine({
    street: raw.street,
    streetNumber: raw.houseNumber,
    hint: raw.label,
  })
  const city = clean(raw.city)
  const state = clean(raw.state)
  const zip = clean(raw.postalCode)
  const country = clean(raw.countryName)

  const address: Address = {}
  if (line1) address.line1 = line1
  if (city) address.city = city
  if (state) address.state = state
  if (zip) address.zip = zip
  if (country) address.country = country

  if (!hasAddressContent(address)) return null

  return {
    address,
    formattedAddress: clean(raw.label) ?? buildFormattedAddress(address),
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T | null> {
  if (signal?.aborted) return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: T | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(value)
    }
    const onAbort = () => finish(null)
    const timer = setTimeout(() => finish(null), timeoutMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => finish(value),
      () => finish(null)
    )
  })
}

async function reverseGeocodeViaApi(
  coordinate: Coordinate,
  options?: { signal?: AbortSignal; locale?: string }
): Promise<ReverseGeocodeResult | null> {
  if (options?.signal?.aborted || isKnownOffline()) return null
  const params = new URLSearchParams({
    at: `${coordinate.latitude.toFixed(5)},${coordinate.longitude.toFixed(5)}`,
  })
  if (options?.locale) params.set('lang', options.locale)

  try {
    const { data } = await request<{
      ok?: boolean
      address?: HereReverseGeocodeAddress | null
    } | null>({
      url: `${apis.reverseGeocode}?${params.toString()}`,
      timeoutMs: REVERSE_GEOCODE_TIMEOUT_MS,
      signal: options?.signal,
    })
    return addressFromHereReverseGeocode(data?.address)
  } catch {
    return null
  }
}

export async function reverseGeocodeCoordinate(
  coordinate: Coordinate,
  options?: { signal?: AbortSignal; locale?: string }
): Promise<ReverseGeocodeResult | null> {
  if (options?.signal?.aborted) return null

  if (Platform.OS === 'web') {
    return reverseGeocodeViaApi(coordinate, options)
  }

  const places = await withTimeout(
    Location.reverseGeocodeAsync(coordinate),
    REVERSE_GEOCODE_TIMEOUT_MS,
    options?.signal
  )
  if (options?.signal?.aborted) return null

  const first = places?.[0]
  if (first) {
    const resolved = addressFromGeocodedPlace(first)
    if (resolved) return resolved
  }

  if (Platform.OS === 'android') {
    return reverseGeocodeViaApi(coordinate, options)
  }

  return null
}
