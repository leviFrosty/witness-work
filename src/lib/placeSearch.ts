import axios from 'axios'
import * as PlaceSearchNative from '../../modules/place-search'
import type { PlaceSearchScope } from '../../modules/place-search'
import apis from '@/constants/apis'
import type { Address } from '@/types/contact'
import type { PlanLocation } from '@/types/timeEntry'

export type { PlaceSearchScope }

/** A picked place: a Plan location plus, when known, its address parts. */
export type ResolvedPlace = PlanLocation & { postalAddress?: Address }

export type PlaceSuggestion = {
  id: string
  title: string
  subtitle: string
  /** Set when the search already returned the full place (HERE). */
  place?: ResolvedPlace
}

export type Coordinate = { latitude: number; longitude: number }

export type PlaceSearchProvider = 'mapkit' | 'here'

/**
 * Which service searches `scope` on this binary. MapKit runs on iOS through the
 * native module and costs nothing per request. Address search falls back to
 * HERE (through ww-api) on Android and on iOS binaries that predate the
 * module's address scope. Points of interest need MapKit, so `all` has no
 * fallback.
 */
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
  near?: Coordinate
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
  const { data } = await axios.get<{ items: HereAutocompleteItem[] }>(
    `${apis.autocomplete}?${params.toString()}`
  )
  return data.items.map(hereSuggestion)
}

/** Places matching `query` within `scope`, biased toward `near`. */
export async function searchPlaces(
  query: string,
  near?: Coordinate,
  scope: PlaceSearchScope = 'all'
): Promise<PlaceSuggestion[]> {
  if (!query.trim()) return []
  switch (placeSearchProvider(scope)) {
    case 'mapkit':
      return PlaceSearchNative.autocomplete(query, near, scope)
    case 'here':
      return searchHere(query, near)
    default:
      return []
  }
}

/**
 * Native dictionaries arrive in hash order, and `addressToString` joins fields
 * in key order, so rebuild the address in the order the contact form uses.
 */
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

/** Resolves a picked suggestion to a place, or undefined if not found. */
export async function resolvePlace(
  suggestion: PlaceSuggestion
): Promise<ResolvedPlace | undefined> {
  if (suggestion.place) return suggestion.place
  const place = await PlaceSearchNative.resolve(suggestion)
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

/** The Plan location for a picked place; drops the address parts. */
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

/**
 * Display lines for a location: the place name over its address, or just the
 * address when there's no name. Falls back to coordinates.
 */
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

/**
 * Apple Maps link for a location. `q` labels the pin, `ll` pins it exactly, and
 * `address` lets Maps geocode when coordinates are missing. Undefined when
 * there is nothing to show.
 */
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
