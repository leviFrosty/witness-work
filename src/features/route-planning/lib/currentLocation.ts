import * as Location from 'expo-location'
import type { Coordinate } from '@/types/contact'
import { errorTracking } from '@/lib/errorTracking'
import { isLocationTemporarilyUnavailableError } from '@/lib/locationError'

/** A recent fix is close enough to start a driving route from. */
const RECENT_FIX_MAX_AGE_MS = 2 * 60_000
const RECENT_FIX_MAX_ACCURACY_M = 200
/** A balanced fix takes a few seconds; indoors it can never arrive. */
const FIX_TIMEOUT_MS = 15_000

export type CurrentCoordinate =
  | { ok: true; coordinate: Coordinate }
  | { ok: false; reason: 'denied' | 'unavailable' }

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })

/** The device's position for the route's start, asking permission if needed. */
export const currentCoordinate = async (): Promise<CurrentCoordinate> => {
  try {
    const permission = await Location.requestForegroundPermissionsAsync()
    if (!permission.granted) return { ok: false, reason: 'denied' }
    const position =
      (await Location.getLastKnownPositionAsync({
        maxAge: RECENT_FIX_MAX_AGE_MS,
        requiredAccuracy: RECENT_FIX_MAX_ACCURACY_M,
      })) ??
      (await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        FIX_TIMEOUT_MS
      ))
    if (!position) return { ok: false, reason: 'unavailable' }
    return {
      ok: true,
      coordinate: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
    }
  } catch (error) {
    if (!isLocationTemporarilyUnavailableError(error)) {
      errorTracking.captureException(error)
    }
    return { ok: false, reason: 'unavailable' }
  }
}
