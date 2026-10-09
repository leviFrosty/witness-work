import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

export interface PlaceSearchCompletion {
  /** Stable for a given title + subtitle; used by native to resolve. */
  id: string
  title: string
  subtitle: string
}

export interface PlaceSearchPostalAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export interface PlaceSearchPlace {
  /** Present only for points of interest, not bare street addresses. */
  name?: string
  /** Single-line formatted postal address. */
  address?: string
  /** Address parts; version 2 binaries only. */
  postalAddress?: PlaceSearchPostalAddress
  latitude: number
  longitude: number
}

/** `address` leaves out points of interest; `all` includes them. */
export type PlaceSearchScope = 'address' | 'all'

interface PlaceSearchNative {
  placeSearchVersion?: number
  autocomplete(
    query: string,
    latitude: number | null,
    longitude: number | null,
    scope?: PlaceSearchScope
  ): Promise<PlaceSearchCompletion[]>
  resolve(title: string, subtitle: string): Promise<PlaceSearchPlace | null>
}

const native = requireOptionalNativeModule<PlaceSearchNative>('PlaceSearch')

/**
 * Whether this binary contains the MapKit place search module. OTA updates can
 * run against older binaries without it; the Plan location field stays hidden
 * there.
 */
const version =
  Platform.OS === 'ios' && native !== null
    ? (native.placeSearchVersion ?? 0)
    : 0

export const isAvailable: boolean = version >= 1

/**
 * Whether this binary can search addresses only and return their parts. Version
 * 1 binaries reject the extra `scope` argument.
 */
export const supportsAddressScope: boolean = version >= 2

/**
 * MapKit autocomplete for points of interest and addresses. Results are biased
 * toward the coordinate when given. A newer call supersedes an in-flight one,
 * which then resolves to an empty list. Rejects when the search fails rather
 * than finds nothing, with `code` `offline`, `timeout`, `rate_limited` or
 * `place_search_failed` (binaries before that resolve to an empty list).
 */
export async function autocomplete(
  query: string,
  coordinate?: { latitude: number; longitude: number },
  scope: PlaceSearchScope = 'all'
): Promise<PlaceSearchCompletion[]> {
  if (!isAvailable) return []
  const latitude = coordinate?.latitude ?? null
  const longitude = coordinate?.longitude ?? null
  if (!supportsAddressScope) {
    if (scope === 'address') return []
    return native!.autocomplete(query, latitude, longitude)
  }
  return native!.autocomplete(query, latitude, longitude, scope)
}

/**
 * Resolves a completion to coordinates, a POI name, and an address; null when
 * MapKit finds nothing. Rejects like `autocomplete` when the lookup fails.
 */
export async function resolve(
  completion: Pick<PlaceSearchCompletion, 'title' | 'subtitle'>
): Promise<PlaceSearchPlace | null> {
  if (!isAvailable) return null
  return native!.resolve(completion.title, completion.subtitle)
}
