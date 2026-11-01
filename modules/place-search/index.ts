import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

export interface PlaceSearchCompletion {
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
  name?: string

  address?: string

  postalAddress?: PlaceSearchPostalAddress
  latitude: number
  longitude: number
}

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

const version =
  Platform.OS === 'ios' && native !== null
    ? (native.placeSearchVersion ?? 0)
    : 0

export const isAvailable: boolean = version >= 1

export const supportsAddressScope: boolean = version >= 2

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

export async function resolve(
  completion: Pick<PlaceSearchCompletion, 'title' | 'subtitle'>
): Promise<PlaceSearchPlace | null> {
  if (!isAvailable) return null
  return native!.resolve(completion.title, completion.subtitle)
}
