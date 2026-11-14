import { HERE_API } from '../config'
import { PLACE_SEARCH_LIMITS as LIMITS } from './config'

/**
 * Point-of-interest search for the web app (witness-work ADR 0037 §8), where
 * MapKit's native search isn't available: HERE Discover, one transaction per
 * request, biased toward `at`. The answer is cut down to what the app's place
 * field shows (the native POI path's name, address, and coordinates) plus
 * HERE's id and category, never HERE's contacts or opening hours.
 */

export interface PlaceSearchQuery {
  q: string
  lat: number
  lng: number
  limit: number
  lang?: string
}

export interface PlaceSearchAddress {
  /** One line, as HERE formats it for the place's country. */
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

export interface PlaceSearchItem {
  /** HERE's id for the result. */
  id: string
  /** Only for points of interest; an address has none. */
  name?: string
  /** The place's primary HERE category. */
  category?: { id: string; name: string }
  address: PlaceSearchAddress
  latitude: number
  longitude: number
  /** Straight-line distance from `at`, in metres. */
  distanceMeters?: number
}

export type PlaceSearchResult =
  | { kind: 'ok'; items: PlaceSearchItem[] }
  /** HERE refused the query itself. */
  | { kind: 'bad_request' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  /** HERE failed, timed out, or answered with something we can't read. */
  | { kind: 'upstream_error'; status: number | null }

export type PlaceSearchQueryResult =
  | { ok: true; query: PlaceSearchQuery }
  | { ok: false; field: 'q' | 'at' | 'limit' | 'lang' }

const AT = /^(-?\d{1,3}(?:\.\d{1,15})?),(-?\d{1,3}(?:\.\d{1,15})?)$/
const LIMIT = /^\d{1,3}$/
const LANG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8}){0,3}$/
// C0, DEL, and C1 control characters.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

/** Reads `q`, `at`, `limit`, and `lang`; every other parameter is ignored. */
export const parsePlaceSearchQuery = (
  params: URLSearchParams
): PlaceSearchQueryResult => {
  const q = params.get('q')?.trim() ?? ''
  // Characters as people count them (code points), not UTF-16 units.
  if (!q || [...q].length > LIMITS.maxQueryLength || CONTROL.test(q))
    return { ok: false, field: 'q' }

  const at = AT.exec(params.get('at')?.trim() ?? '')
  const lat = Number(at?.[1])
  const lng = Number(at?.[2])
  if (!at || !(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180))
    return { ok: false, field: 'at' }

  const rawLimit = params.get('limit')
  let limit: number = LIMITS.defaultResults
  if (rawLimit != null) {
    limit = LIMIT.test(rawLimit) ? Number(rawLimit) : 0
    if (limit < 1 || limit > LIMITS.maxResults)
      return { ok: false, field: 'limit' }
  }

  const lang = params.get('lang') ?? undefined
  if (lang != null && !LANG.test(lang)) return { ok: false, field: 'lang' }

  return { ok: true, query: { q, lat, lng, limit, lang } }
}

const coordinate = (value: number) =>
  Number(value.toFixed(LIMITS.atDecimals))

export const buildDiscoverUrl = (
  query: PlaceSearchQuery,
  apiKey: string
): string => {
  const params = new URLSearchParams({
    q: query.q,
    at: `${coordinate(query.lat)},${coordinate(query.lng)}`,
    limit: String(query.limit),
  })
  if (query.lang) params.set('lang', query.lang)
  params.set(HERE_API.API_KEY_PARAM, apiKey)
  return `${HERE_API.DISCOVER_URL}?${params.toString()}`
}

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

const text = (value: unknown, max = 500): string | undefined =>
  typeof value === 'string' && value.trim() && value.length <= max
    ? value
    : undefined

const record = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const primaryCategory = (
  value: unknown
): PlaceSearchItem['category'] | undefined => {
  if (!Array.isArray(value)) return undefined
  const categories = value.map(record).filter((c) => c != null)
  const chosen = categories.find((c) => c.primary === true) ?? categories[0]
  const id = text(chosen?.id)
  const name = text(chosen?.name)
  return id && name ? { id, name } : undefined
}

/**
 * A POI's label is "<its name>, <postal address>", and the name in it isn't
 * always the `title` ("Kingdom Hall of …" vs "… (Kingdom Hall)"). The native
 * path keeps the two apart, so the label is cut where the postal address
 * starts: the first of its house number and street, street, district, or
 * city that follows a ", ". A label with none of them stays whole.
 */
const withoutPlaceName = (
  label: string,
  address: Record<string, unknown>
): string => {
  const street = text(address.street)
  const houseNumber = text(address.houseNumber)
  const starts = [
    houseNumber && street ? `${houseNumber} ${street}` : undefined,
    houseNumber && street ? `${street} ${houseNumber}` : undefined,
    street,
    text(address.district),
    text(address.city),
  ]
  for (const start of starts) {
    if (!start) continue
    const at = label.indexOf(`, ${start}`)
    if (at > 0) return label.slice(at + 2)
  }
  return label
}

/** One HERE Discover item, or null when it lacks an id, address, or position. */
export const toPlaceSearchItem = (value: unknown): PlaceSearchItem | null => {
  const item = record(value)
  const address = record(item?.address)
  const position = record(item?.position)
  const id = text(item?.id)
  const label = text(address?.label)
  const latitude = position?.lat
  const longitude = position?.lng
  if (
    !id ||
    !label ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !(Math.abs(latitude) <= 90) ||
    !(Math.abs(longitude) <= 180)
  )
    return null

  // HERE's `title` is the place's name for a POI and the address otherwise.
  const name = item?.resultType === 'place' ? text(item.title) : undefined
  const postalLabel = name ? withoutPlaceName(label, address ?? {}) : label
  const result: PlaceSearchItem = {
    id,
    address: { label: postalLabel },
    latitude,
    longitude,
  }
  for (const field of ADDRESS_FIELDS) {
    const value = text(address?.[field])
    if (value) result.address[field] = value
  }
  if (name) result.name = name
  const category = primaryCategory(item?.categories)
  if (category) result.category = category
  const distance = item?.distance
  if (typeof distance === 'number' && Number.isFinite(distance) && distance >= 0)
    result.distanceMeters = Math.round(distance)
  return result
}

/** HERE's own `Retry-After` in whole seconds, when it sent a number. */
const retryAfter = (response: Response): number | undefined => {
  const seconds = Number(response.headers.get('Retry-After') ?? NaN)
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.max(1, Math.ceil(seconds))
    : undefined
}

export const searchPlaces = async (
  query: PlaceSearchQuery,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<PlaceSearchResult> => {
  let response: Response
  let body: unknown
  try {
    response = await fetchImpl(buildDiscoverUrl(query, apiKey), {
      signal: AbortSignal.timeout(LIMITS.hereTimeoutMs),
    })
    const raw = await response.text()
    try {
      body = JSON.parse(raw)
    } catch {
      // HERE sits behind Cloudflare; outages arrive as plain-text pages.
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
  return {
    kind: 'ok',
    items: items
      .map(toPlaceSearchItem)
      .filter((item): item is PlaceSearchItem => item != null)
      .slice(0, query.limit),
  }
}
