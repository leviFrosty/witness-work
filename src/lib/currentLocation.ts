import * as Location from 'expo-location'
import { create } from 'zustand'
import type { Coordinate } from '@/types/contact'
import { errorTracking } from '@/lib/errorTracking'
import { isExpectedLocationError } from '@/lib/locationError'

const LAST_KNOWN_MAX_AGE_MS = 2 * 60_000
const LAST_KNOWN_MAX_ACCURACY_M = 200

export const FRESH_FIX_MAX_AGE_MS = 10 * 60_000

type CurrentLocationState = {
  coordinate: Coordinate | null

  fixedAt: number | null

  granted: boolean | null

  canAsk: boolean
}

export const useCurrentLocation = create<CurrentLocationState>(() => ({
  coordinate: null,
  fixedAt: null,
  granted: null,
  canAsk: true,
}))

export const selectFreshCoordinate = (
  state: CurrentLocationState
): Coordinate | null =>
  state.coordinate &&
  state.fixedAt !== null &&
  Date.now() - state.fixedAt <= FRESH_FIX_MAX_AGE_MS
    ? state.coordinate
    : null

let inFlight: Promise<Coordinate | null> | null = null

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
      if (!isExpectedLocationError(error)) {
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
