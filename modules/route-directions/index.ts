import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

export interface RouteDirectionsLeg {
  distanceMeters: number
  durationSeconds: number
  /** The road shape as flat `[lat, lng, lat, lng, …]`. */
  coordinates: number[]
}

interface RouteDirectionsNative {
  routeDirectionsVersion?: number
  directions(
    fromLatitude: number,
    fromLongitude: number,
    toLatitude: number,
    toLongitude: number
  ): Promise<RouteDirectionsLeg | null>
}

const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<RouteDirectionsNative>('RouteDirections')
    : null

/**
 * Whether this binary contains the MapKit directions module. OTA updates can
 * run against older binaries without it; the route keeps its estimates there.
 */
export const isAvailable: boolean = (native?.routeDirectionsVersion ?? 0) >= 1

/**
 * MapKit driving directions for one leg; null when there's no road route.
 * Rejects when directions can't be had, with `code` `offline`, `timeout`,
 * `rate_limited` or `directions_failed`.
 */
export async function directions(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<RouteDirectionsLeg | null> {
  if (!isAvailable) return null
  return native!.directions(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude
  )
}
