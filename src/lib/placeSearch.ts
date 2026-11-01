import * as PlaceSearchNative from '../../modules/place-search'
import type { PlaceSearchScope } from '../../modules/place-search'
import apis from '@/constants/apis'
import { errorBodyCode } from '@/lib/http/errorBody'
import { classifyNetworkError } from '@/lib/http/networkError'
import { isDeviceOffline, isKnownOffline } from '@/lib/http/online'
import { HttpError, request } from '@/lib/http/request'
import type { Address } from '@/types/contact'
import type { PlanLocation } from '@/types/timeEntry'

export type { PlaceSearchScope }

export type ResolvedPlace = PlanLocation & { postalAddress?: Address }

export type PlaceSuggestion = {
  id: string
  title: string
  subtitle: string

  place?: ResolvedPlace
}

export type Coordinate = { latitude: number; longitude: number }

export type PlaceSearchProvider = 'mapkit' | 'here'

export function placeSearchProvider(
  scope: PlaceSearchScope
): PlaceSearchProvider | undefined {
  if (scope === 'all') {
    return PlaceSearchNative.isAvailable ? 'mapkit' : undefined
  }
  return PlaceSearchNative.supportsAddressScope ? 'mapkit' : 'here'
}

const HERE_SEARCH_RADIUS_METERS = 1_000_000
const HERE_MAX_SUGGESTIONS = 5

const SEARCH_TIMEOUT_MS = 8_000
const RESOLVE_TIMEOUT_MS = 10_000

type HereAutocompleteItem = {
  id: string
  address: {
    label: string
    houseNumber?: string
    street?: string
    city?: string
    state?: string
    postalCode?: string
    countryName?: string
  }
}

const optionalString = (value: unknown) =>
  value === undefined || typeof value === 'string'

const isHereItem = (value: unknown): value is HereAutocompleteItem => {
  const item = value as Partial<HereAutocompleteItem> | null
  const address = item?.address as Record<string, unknown> | undefined
  return (
    typeof item?.id === 'string' &&
    typeof address?.label === 'string' &&
    [
      'houseNumber',
      'street',
      'city',
      'state',
      'postalCode',
      'countryName',
    ].every((key) => optionalString(address[key]))
  )
}

const hereSuggestion = ({ id, address }: HereAutocompleteItem) => {
  const line1 = address.houseNumber
    ? `${address.houseNumber} ${address.street ?? ''}`.trim()
    : address.street
  const title = line1 || address.label
  const subtitle = address.label.startsWith(`${title}, `)
    ? address.label.slice(title.length + 2)
    : ''
  return {
    id,
    title,
    subtitle,
    place: {
      address: address.label,
      postalAddress: {
        line1,
        city: address.city,
        state: address.state,
        zip: address.postalCode,
        country: address.countryName,
      },
    },
  } satisfies PlaceSuggestion
}

async function searchHere(
  query: string,
  near: Coordinate | undefined,
  signal: AbortSignal | undefined
): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(HERE_MAX_SUGGESTIONS),
  })
  if (near) {
    params.set(
      'in',
      `circle:${near.latitude},${near.longitude};r=${HERE_SEARCH_RADIUS_METERS}`
    )
  }

  let data: { items?: unknown } | null
  try {
    ;({ data } = await request<{ items?: unknown } | null>({
      url: `${apis.autocomplete}?${params.toString()}`,
      timeoutMs: SEARCH_TIMEOUT_MS,
      signal,
    }))
  } catch (error) {
    if (errorBodyCode(error) === 'not_found') return []
    throw error
  }
  if (!Array.isArray(data?.items)) {
    throw new HttpError('unknown', null, null, null, 'invalid autocomplete')
  }
  return data.items.filter(isHereItem).map(hereSuggestion)
}

function bounded<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new HttpError('cancelled'))
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      done()
      reject(new HttpError('cancelled'))
    }
    const timer = setTimeout(() => {
      done()
      reject(new HttpError('timeout'))
    }, timeoutMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        done()
        resolve(value)
      },
      (error: unknown) => {
        done()
        reject(error)
      }
    )
  })
}

export async function searchPlaces(
  query: string,
  near?: Coordinate,
  scope: PlaceSearchScope = 'all',
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  if (!query.trim()) return []
  switch (placeSearchProvider(scope)) {
    case 'mapkit':
      if (isKnownOffline()) throw new HttpError('offline')
      return bounded(
        PlaceSearchNative.autocomplete(query, near, scope),
        SEARCH_TIMEOUT_MS,
        signal
      )
    case 'here':
      return searchHere(query, near, signal)
    default:
      return []
  }
}

export type PlaceSearchFailure = 'offline' | 'busy' | 'failed'

export function placeSearchFailure(error: unknown): PlaceSearchFailure {
  const kind = classifyNetworkError(error)
  if (isDeviceOffline(kind)) return 'offline'
  switch (kind) {
    case 'rateLimited':
      return 'busy'
    default:
      return 'failed'
  }
}

export function isUnexpectedPlaceSearchError(error: unknown): boolean {
  if ((error as { code?: unknown } | null)?.code === 'place_search_failed') {
    return false
  }
  const kind = classifyNetworkError(error)
  return kind === 'unknown' || kind === 'client'
}

const orderedAddress = (address: Address): Address => {
  const ordered: Address = {}
  for (const key of ADDRESS_KEYS) {
    if (address[key]) ordered[key] = address[key]
  }
  return ordered
}

const ADDRESS_KEYS = [
  'line1',
  'line2',
  'city',
  'state',
  'zip',
  'country',
] as const satisfies readonly (keyof Address)[]

export async function resolvePlace(
  suggestion: PlaceSuggestion
): Promise<ResolvedPlace | undefined> {
  if (suggestion.place) return suggestion.place
  if (isKnownOffline()) throw new HttpError('offline')
  const place = await bounded(
    PlaceSearchNative.resolve(suggestion),
    RESOLVE_TIMEOUT_MS
  )
  if (!place) return undefined
  return {
    ...(place.name ? { name: place.name } : {}),
    ...(place.address ? { address: place.address } : {}),
    ...(place.postalAddress
      ? { postalAddress: orderedAddress(place.postalAddress) }
      : {}),
    latitude: place.latitude,
    longitude: place.longitude,
  }
}

export function toPlanLocation({
  postalAddress: _postalAddress,
  ...location
}: ResolvedPlace): PlanLocation {
  return location
}

const hasCoordinates = (
  location: PlanLocation
): location is PlanLocation & Coordinate =>
  typeof location.latitude === 'number' &&
  typeof location.longitude === 'number' &&
  Number.isFinite(location.latitude) &&
  Number.isFinite(location.longitude)

const clean = (value?: string) => value?.trim() || undefined

export function formatPlanLocation(location: PlanLocation): {
  primary: string
  secondary?: string
} {
  const name = clean(location.name)
  const address = clean(location.address)

  if (name) {
    return address && address !== name
      ? { primary: name, secondary: address }
      : { primary: name }
  }
  if (address) return { primary: address }
  if (hasCoordinates(location)) {
    return {
      primary: `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`,
    }
  }
  return { primary: '' }
}

export function appleMapsUrl(location: PlanLocation): string | undefined {
  const name = clean(location.name)
  const address = clean(location.address)
  const params: [string, string][] = []

  const q = name ?? address
  if (q) params.push(['q', q])
  if (hasCoordinates(location)) {
    params.push(['ll', `${location.latitude},${location.longitude}`])
  }
  if (address) params.push(['address', address])

  if (params.length === 0) return undefined
  const query = params
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
  return `https://maps.apple.com/?${query}`
}
