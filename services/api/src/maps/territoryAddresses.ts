import { z } from 'zod'
import {
  TERRITORY_ADDRESS_LIMITS as LIMITS,
  OVERPASS_USER_AGENT,
} from './config'

/**
 * House-number address points inside a territory outline, from
 * OpenStreetMap through Overpass, so the app can prefill each street's house
 * numbers. Apple's and HERE's geocoders return only the nearest address to a
 * point, so neither can list every house; OSM lists them where they're mapped
 * and has none elsewhere, and the app keeps its own behavior when the list is
 * empty.
 */

export interface TerritoryAddress {
  /** `addr:street`, or `addr:place` where there's no street. */
  street: string
  /** One house number; multi-value tags are split into separate entries. */
  number: string
  latitude: number
  longitude: number
}

export interface OutlinePoint {
  latitude: number
  longitude: number
}

export const outlinePointSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict()

export const territoryAddressRequestSchema = z
  .object({
    outline: z
      .array(outlinePointSchema)
      .min(LIMITS.minOutlinePoints)
      .max(LIMITS.maxOutlinePoints),
  })
  .strict()

export type TerritoryAddressRequest = z.infer<
  typeof territoryAddressRequestSchema
>

export type TerritoryAddressField = 'body' | 'outline'

export type ParsedTerritoryAddressRequest =
  | { ok: true; outline: OutlinePoint[] }
  | { ok: false; field: TerritoryAddressField }

/** Parses the JSON text; `field` names what's wrong when it isn't valid. */
export const parseTerritoryAddressRequest = (
  text: string
): ParsedTerritoryAddressRequest => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, field: 'body' }
  }
  const parsed = territoryAddressRequestSchema.safeParse(json)
  if (parsed.success) return { ok: true, outline: parsed.data.outline }
  const onOutline = parsed.error.issues.some(
    (issue) => issue.path[0] === 'outline'
  )
  return { ok: false, field: onOutline ? 'outline' : 'body' }
}

const METERS_PER_DEGREE = 111_320

/**
 * The outline's bounding box in metres, east–west at its middle latitude. An
 * outline across the antimeridian measures the long way round, so it's
 * refused as too large; no territory is drawn there.
 */
export const boundingBoxMeters = (
  outline: readonly OutlinePoint[]
): { widthMeters: number; heightMeters: number } => {
  const latitudes = outline.map((point) => point.latitude)
  const longitudes = outline.map((point) => point.longitude)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180)
  return {
    heightMeters: (maxLat - minLat) * METERS_PER_DEGREE,
    widthMeters:
      (Math.max(...longitudes) - Math.min(...longitudes)) *
      METERS_PER_DEGREE *
      Math.cos(midLat),
  }
}

export const isAreaTooLarge = (outline: readonly OutlinePoint[]): boolean => {
  const { widthMeters, heightMeters } = boundingBoxMeters(outline)
  return (
    widthMeters > LIMITS.maxSideMeters || heightMeters > LIMITS.maxSideMeters
  )
}

const round = (value: number) =>
  Number(value.toFixed(LIMITS.coordinateDecimals))

/**
 * The outline rounded to about a metre, without a closing point that repeats
 * the first: the same territory always makes the same query and cache key.
 */
export const normalizeOutline = (
  outline: readonly OutlinePoint[]
): OutlinePoint[] => {
  const rounded = outline.map((point) => ({
    latitude: round(point.latitude),
    longitude: round(point.longitude),
  }))
  const first = rounded[0]
  const last = rounded[rounded.length - 1]
  if (
    rounded.length > LIMITS.minOutlinePoints &&
    first &&
    last &&
    first.latitude === last.latitude &&
    first.longitude === last.longitude
  )
    rounded.pop()
  return rounded
}

/** Overpass QL for every element with a house number inside the outline. */
export const buildOverpassQuery = (
  outline: readonly OutlinePoint[]
): string => {
  const poly = outline
    .map((point) => `${point.latitude} ${point.longitude}`)
    .join(' ')
  return `[out:json][timeout:${LIMITS.overpassQueryTimeoutSeconds}];nwr["addr:housenumber"](poly:"${poly}");out tags center;`
}

/**
 * The Cache API key for an outline: a SHA-256 of the normalized outline on a
 * synthetic path of this worker's host, so the coordinates never appear in it.
 * `v1` changes when the answer's shape or parsing does.
 */
export const territoryAddressCacheKey = async (
  outline: readonly OutlinePoint[],
  requestUrl: string
): Promise<Request> => {
  const normalized = outline
    .map((point) => `${point.latitude},${point.longitude}`)
    .join(';')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized)
  )
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return new Request(
    new URL(`/maps/v1/addresses/cache/v1/${hex}`, requestUrl).toString()
  )
}

const record = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const trimmed = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const isCoordinate = (latitude: unknown, longitude: unknown) =>
  typeof latitude === 'number' &&
  typeof longitude === 'number' &&
  Math.abs(latitude) <= 90 &&
  Math.abs(longitude) <= 180

/** A node's own position, or a way's or relation's `center`. */
const positionOf = (
  element: Record<string, unknown>
): { latitude: number; longitude: number } | null => {
  const center = record(element.center)
  const latitude = element.type === 'node' ? element.lat : center?.lat
  const longitude = element.type === 'node' ? element.lon : center?.lon
  if (!isCoordinate(latitude, longitude)) return null
  return {
    latitude: round(latitude as number),
    longitude: round(longitude as number),
  }
}

/** `629;631;633` and `629,631` are three and two houses at one point. */
const houseNumbers = (value: unknown): string[] => {
  if (typeof value !== 'string') return []
  return value
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => part && part.length <= LIMITS.maxNumberLength)
}

/**
 * Overpass's `elements` as addresses: one entry per street and house number,
 * the first one found wins, in Overpass's order, at most `maxAddresses`.
 */
export const parseOverpassElements = (
  elements: unknown[]
): TerritoryAddress[] => {
  const addresses: TerritoryAddress[] = []
  const seen = new Set<string>()
  for (const value of elements) {
    if (addresses.length >= LIMITS.maxAddresses) break
    const element = record(value)
    const tags = record(element?.tags)
    if (!element || !tags) continue
    const street = trimmed(tags['addr:street']) ?? trimmed(tags['addr:place'])
    if (!street || street.length > LIMITS.maxStreetLength) continue
    const position = positionOf(element)
    if (!position) continue
    for (const number of houseNumbers(tags['addr:housenumber'])) {
      const key = `${street}\u0000${number}`
      if (seen.has(key)) continue
      seen.add(key)
      addresses.push({ street, number, ...position })
      if (addresses.length >= LIMITS.maxAddresses) break
    }
  }
  return addresses
}

export type OverpassResult =
  | { kind: 'ok'; addresses: TerritoryAddress[] }
  /**
   * Overpass is overloaded: 429, a 502/503/504 ("at capacity", "queue is
   * full"), its own query timeout, or no answer in time.
   */
  | { kind: 'busy'; retryAfterSeconds?: number }
  /** Overpass failed, was unreachable, or answered something unreadable. */
  | { kind: 'upstream_error'; status: number | null }

/**
 * Overpass's answers when it can't take the query now: rate limited (429), or
 * at capacity with its queue full (502, 503, 504).
 */
const BUSY_STATUSES = new Set([429, 502, 503, 504])

/** Overpass's own `Retry-After` in whole seconds, when it sent a number. */
const retryAfter = (response: Response): number | undefined => {
  const seconds = Number(response.headers.get('Retry-After') ?? NaN)
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.max(1, Math.ceil(seconds))
    : undefined
}

/**
 * Asks Overpass for the outline's address points. The outline goes in a form
 * POST body, never a URL. `outline` must already be normalized.
 */
export const fetchTerritoryAddresses = async (
  outline: readonly OutlinePoint[],
  overpassUrl: string,
  fetchImpl: typeof fetch
): Promise<OverpassResult> => {
  let response: Response
  let raw: string
  try {
    response = await fetchImpl(overpassUrl, {
      method: 'POST',
      headers: {
        'User-Agent': OVERPASS_USER_AGENT,
        Accept: 'application/json',
      },
      body: new URLSearchParams({ data: buildOverpassQuery(outline) }),
      signal: AbortSignal.timeout(LIMITS.overpassTimeoutMs),
    })
    raw = await response.text()
  } catch (error) {
    // Under load Overpass queues a query before it runs, so waiting too long
    // means it's busy, not broken.
    if (error instanceof Error && error.name === 'TimeoutError')
      return { kind: 'busy' }
    return { kind: 'upstream_error', status: null }
  }

  if (BUSY_STATUSES.has(response.status))
    return { kind: 'busy', retryAfterSeconds: retryAfter(response) }
  if (!response.ok) return { kind: 'upstream_error', status: response.status }

  let body: Record<string, unknown> | null
  try {
    body = record(JSON.parse(raw))
  } catch {
    // Overpass answers some failures as 200 with an HTML or XML page.
    return { kind: 'upstream_error', status: response.status }
  }
  // A query that runs out of time or memory still answers 200, with a
  // `remark` and whatever it had found so far: not a full answer.
  const remark = typeof body?.remark === 'string' ? body.remark : ''
  if (/runtime error/i.test(remark)) return { kind: 'busy' }
  const elements = body?.elements
  if (!Array.isArray(elements))
    return { kind: 'upstream_error', status: response.status }
  return { kind: 'ok', addresses: parseOverpassElements(elements) }
}
