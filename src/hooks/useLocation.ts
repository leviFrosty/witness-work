import { useCallback, useEffect, useState } from 'react'
import * as Location from 'expo-location'
import { errorTracking } from '@/lib/errorTracking'
import { isExpectedLocationError } from '@/lib/locationError'

const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000

export default function useLocation() {
  const [status, setStatus] = useState<Location.PermissionStatus | null>(null)
  const [location, setLocation] = useState<Location.LocationObject | null>(null)

  const fetchCurrentPosition = useCallback(async () => {
    try {
      const result =
        (await Location.getLastKnownPositionAsync({
          maxAge: LAST_KNOWN_MAX_AGE_MS,
        })) ?? (await Location.getCurrentPositionAsync())
      setLocation(result)
    } catch (error) {
      if (!isExpectedLocationError(error)) {
        errorTracking.captureException(error)
      }
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    const result = await Location.getForegroundPermissionsAsync()
    setStatus(result.status)
    if (result.granted) {
      await fetchCurrentPosition()
    }
  }, [fetchCurrentPosition])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const requestLocation = useCallback(async () => {
    const current = await Location.getForegroundPermissionsAsync()
    const result = current.granted
      ? current
      : await Location.requestForegroundPermissionsAsync()
    setStatus(result.status)
    if (result.granted) {
      await fetchCurrentPosition()
    }
    return result
  }, [fetchCurrentPosition])

  return {
    locationPermission: status === Location.PermissionStatus.GRANTED,
    location,
    status,
    requestLocation,
    refreshStatus,
  }
}
