import * as Location from 'expo-location'
import { create } from 'zustand'
import type { Coordinate } from '@/types/contact'
import { errorTracking } from '@/lib/errorTracking'
import { isLocationTemporarilyUnavailableError } from '@/lib/locationError'

/** A last-known fix this recent and accurate is used as is. */
const LAST_KNOWN_MAX_AGE_MS = 2 * 60_000
const LAST_KNOWN_MAX_ACCURACY_M = 200
/** Older fixes no longer say where the User is standing. */
export const FRESH_FIX_MAX_AGE_MS = 10 * 60_000

type CurrentLocationState = {
  coordinate: Coordinate | null
  /** Epoch ms the coordinate was read. */
  fixedAt: number | null
  /** Foreground permission, once known. */
  granted: boolean | null
  /** False once the OS won't show the permission prompt again. */
  canAsk: boolean
}

/**
 * The device's last read position, kept in memory only (never persisted or sent
 * anywhere). Screens that suggest nearby Contacts read it; refresh it with
 * {@link refreshCurrentLocation} before they open so the fix is ready.
 */
export const useCurrentLocation = create<CurrentLocationState>(() => ({
  coordinate: null,
  fixedAt: null,
  granted: null,
  canAsk: true,
}))

/** The coordinate when it's fresh enough to suggest nearby Contacts. */
export const selectFreshCoordinate = (
  state: CurrentLocationState
): Coordinate | null =>
  state.coordinate &&
  state.fixedAt !== null &&
  Date.now() - state.fixedAt <= FRESH_FIX_MAX_AGE_MS
    ? state.coordinate
    : null

let inFlight: Promise<Coordinate | null> | null = null

/**
 * Reads the device's position into {@link useCurrentLocation}. Without `prompt`
 * it never shows the permission prompt: it only reads when the User already
 * allowed location. Pass `prompt` only from a tap that asks for it.
 */
export const refreshCurrentLocation = ({
  prompt = false,
}: { prompt?: boolean } = {}): Promise<Coordinate | null> => {
  if (inFlight && !prompt) return inFlight
  const run = (async () => {
    try {
      const permission = prompt
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync()
      useCurrentLocation.setState({
        granted: permission.granted,
        canAsk: permission.canAskAgain,
      })
      if (!permission.granted) return null
      const position =
        (await Location.getLastKnownPositionAsync({
          maxAge: LAST_KNOWN_MAX_AGE_MS,
          requiredAccuracy: LAST_KNOWN_MAX_ACCURACY_M,
        })) ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }))
      const coordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }
      useCurrentLocation.setState({ coordinate, fixedAt: Date.now() })
      return coordinate
    } catch (error) {
      if (!isLocationTemporarilyUnavailableError(error)) {
        errorTracking.captureException(error)
      }
      return null
    } finally {
      inFlight = null
    }
  })()
  inFlight = run
  return run
}
