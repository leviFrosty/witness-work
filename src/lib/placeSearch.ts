import * as PlaceSearchNative from '../../modules/place-search'
import type { PlanLocation } from '@/types/timeEntry'

export type PlaceSuggestion = {
  id: string
  title: string
  subtitle: string
}

export type Coordinate = { latitude: number; longitude: number }

/**
 * False on binaries shipped before the MapKit module existed (OTA JS on an old
 * build); callers hide location search there.
 */
export const isPlaceSearchAvailable: boolean = PlaceSearchNative.isAvailable

/** Points of interest and addresses matching `query`, biased toward `near`. */
export async function searchPlaces(
  query: string,
  near?: Coordinate
): Promise<PlaceSuggestion[]> {
  if (!query.trim()) return []
  return PlaceSearchNative.autocomplete(query, near)
}

/** Resolves a picked suggestion to a Plan location, or undefined if not found. */
export async function resolvePlace(
  suggestion: Pick<PlaceSuggestion, 'title' | 'subtitle'>
): Promise<PlanLocation | undefined> {
  const place = await PlaceSearchNative.resolve(suggestion)
  if (!place) return undefined
  return {
    ...(place.name ? { name: place.name } : {}),
    ...(place.address ? { address: place.address } : {}),
    latitude: place.latitude,
    longitude: place.longitude,
  }
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
