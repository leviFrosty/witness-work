import * as Location from 'expo-location'
import type { Coordinate } from '@/types/contact'
import { errorTracking } from '@/lib/errorTracking'
import { isLocationTemporarilyUnavailableError } from '@/lib/locationError'

/** A recent fix is close enough to start a driving route from. */
const RECENT_FIX_MAX_AGE_MS = 2 * 60_000
const RECENT_FIX_MAX_ACCURACY_M = 200

/** The device's position for the route's start, asking permission if needed. */
export const currentCoordinate = async (): Promise<Coordinate | null> => {
  try {
    const permission = await Location.requestForegroundPermissionsAsync()
    if (!permission.granted) return null
    const position =
      (await Location.getLastKnownPositionAsync({
        maxAge: RECENT_FIX_MAX_AGE_MS,
        requiredAccuracy: RECENT_FIX_MAX_ACCURACY_M,
      })) ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }))
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }
  } catch (error) {
    if (!isLocationTemporarilyUnavailableError(error)) {
      errorTracking.captureException(error)
    }
    return null
  }
}
