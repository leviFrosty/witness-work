import { HERE_API } from '../config'
import { REVERSE_GEOCODE_LIMITS as LIMITS } from './config'
import type { PlaceSearchAddress } from './placeSearch'

/**
 * Reverse geocoding for dropped map pins (web app, and fallback where a device
 * has no native geocoder): HERE Reverse Geocode, one transaction per request,
 * returning only the nearest postal address parts.
 */

export interface ReverseGeocodeQuery {
  lat: number
  lng: number
  lang?: string
}

export type ReverseGeocodeQueryResult =
  | { ok: true; query: ReverseGeocodeQuery }
  | { ok: false; field: 'at' | 'lang' }

export type ReverseGeocodeResult =
  | { kind: 'ok'; address: PlaceSearchAddress | null }
  | { kind: 'bad_request' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'upstream_error'; status: number | null }

const AT = /^(-?\d{1,3}(?:\.\d{1,15})?),(-?\d{1,3}(?:\.\d{1,15})?)$/
const LANG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8}){0,3}$/

const ADDRESS_FIELDS = [
  'houseNumber',
  'street',
  'district',
  'city',
  'state',
  'stateCode',
  'postalCode',
  'countryCode',
  'countryName',
] as const satisfies readonly (keyof PlaceSearchAddress)[]

/** Reads `at` and optional `lang`; every other parameter is ignored. */
export const parseReverseGeocodeQuery = (
  params: URLSearchParams
): ReverseGeocodeQueryResult => {
  const at = AT.exec(params.get('at')?.trim() ?? '')
  const lat = Number(at?.[1])
  const lng = Number(at?.[2])
  if (!at || !(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180))
    return { ok: false, field: 'at' }

  const lang = params.get('lang') ?? undefined
  if (lang != null && !LANG.test(lang)) return { ok: false, field: 'lang' }

  return { ok: true, query: { lat, lng, lang } }
}

const coordinate = (value: number) => Number(value.toFixed(LIMITS.atDecimals))

export const buildReverseGeocodeUrl = (
  query: ReverseGeocodeQuery,
  apiKey: string
): string => {
  const params = new URLSearchParams({
    at: `${coordinate(query.lat)},${coordinate(query.lng)}`,
    limit: '1',
  })
  if (query.lang) params.set('lang', query.lang)
  params.set(HERE_API.API_KEY_PARAM, apiKey)
  return `${HERE_API.REVGEOCODE_URL}?${params.toString()}`
}

const text = (value: unknown, max = 500): string | undefined =>
  typeof value === 'string' && value.trim() && value.length <= max
    ? value.trim()
    : undefined

const record = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** Extracts the postal address parts from one HERE revgeocode item. */
export const toReverseGeocodeAddress = (
  value: unknown
): PlaceSearchAddress | null => {
  const item = record(value)
  const address = record(item?.address)
  const label = text(address?.label)
  if (!label) return null

  const result: PlaceSearchAddress = { label }
  for (const field of ADDRESS_FIELDS) {
    const fieldValue = text(address?.[field])
    if (fieldValue) result[field] = fieldValue
  }
  return result
}

const retryAfter = (response: Response): number | undefined => {
  const seconds = Number(response.headers.get('Retry-After') ?? NaN)
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.max(1, Math.ceil(seconds))
    : undefined
}

export const reverseGeocode = async (
  query: ReverseGeocodeQuery,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<ReverseGeocodeResult> => {
  let response: Response
  let body: unknown
  try {
    response = await fetchImpl(buildReverseGeocodeUrl(query, apiKey), {
      signal: AbortSignal.timeout(LIMITS.hereTimeoutMs),
    })
    const raw = await response.text()
    try {
      body = JSON.parse(raw)
    } catch {
      return { kind: 'upstream_error', status: response.status }
    }
  } catch {
    return { kind: 'upstream_error', status: null }
  }

  if (response.status === 429)
    return { kind: 'rate_limited', retryAfterSeconds: retryAfter(response) }
  if (response.status === 400) return { kind: 'bad_request' }
  const items = record(body)?.items
  if (!response.ok || !Array.isArray(items))
    return { kind: 'upstream_error', status: response.status }

  const address =
    items
      .map(toReverseGeocodeAddress)
      .find((entry): entry is PlaceSearchAddress => entry != null) ?? null
  return { kind: 'ok', address }
}
