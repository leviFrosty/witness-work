import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

export interface PlaceSearchCompletion {
  /** Stable for a given title + subtitle; used by native to resolve. */
  id: string
  title: string
  subtitle: string
}

export interface PlaceSearchPlace {
  /** Present only for points of interest, not bare street addresses. */
  name?: string
  /** Single-line formatted postal address. */
  address?: string
  latitude: number
  longitude: number
}

interface PlaceSearchNative {
  placeSearchVersion?: number
  autocomplete(
    query: string,
    latitude: number | null,
    longitude: number | null
  ): Promise<PlaceSearchCompletion[]>
  resolve(title: string, subtitle: string): Promise<PlaceSearchPlace | null>
}

const native = requireOptionalNativeModule<PlaceSearchNative>('PlaceSearch')

/**
 * Whether this binary contains the MapKit place search module. OTA updates can
 * run against older binaries without it; the Plan location field stays hidden
 * there.
 */
export const isAvailable: boolean =
  Platform.OS === 'ios' &&
  native !== null &&
  (native.placeSearchVersion ?? 0) >= 1

/**
 * MapKit autocomplete for points of interest and addresses. Results are biased
 * toward the coordinate when given. A newer call supersedes an in-flight one,
 * which then resolves to an empty list.
 */
export async function autocomplete(
  query: string,
  coordinate?: { latitude: number; longitude: number }
): Promise<PlaceSearchCompletion[]> {
  if (!isAvailable) return []
  return native!.autocomplete(
    query,
    coordinate?.latitude ?? null,
    coordinate?.longitude ?? null
  )
}

/** Resolves a completion to coordinates, a POI name, and an address. */
export async function resolve(
  completion: Pick<PlaceSearchCompletion, 'title' | 'subtitle'>
): Promise<PlaceSearchPlace | null> {
  if (!isAvailable) return null
  return native!.resolve(completion.title, completion.subtitle)
}
