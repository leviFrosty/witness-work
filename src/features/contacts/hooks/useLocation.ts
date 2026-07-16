import { useCallback, useEffect, useState } from 'react'
import * as Location from 'expo-location'
import * as Sentry from '@sentry/react-native'
import { isLocationTemporarilyUnavailableError } from '@/lib/locationError'

export default function useLocation() {
  const [status, setStatus] = useState<Location.PermissionStatus | null>(null)
  const [location, setLocation] = useState<Location.LocationObject | null>(null)

  const fetchCurrentPosition = useCallback(async () => {
    try {
      const result = await Location.getCurrentPositionAsync()
      setLocation(result)
    } catch (error) {
      // Location can be temporarily unavailable; don't report the expected
      // transient failure, just leave the previous location in place.
      if (!isLocationTemporarilyUnavailableError(error)) {
        Sentry.captureException(error)
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
    const result = await Location.requestForegroundPermissionsAsync()
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
