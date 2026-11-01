import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

export interface RouteDirectionsLeg {
  distanceMeters: number
  durationSeconds: number

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

export const isAvailable: boolean = (native?.routeDirectionsVersion ?? 0) >= 1

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
