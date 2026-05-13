import { useCallback, useEffect, useState } from 'react'
import * as Location from 'expo-location'

export default function useLocation() {
  const [status, setStatus] = useState<Location.PermissionStatus | null>(null)
  const [location, setLocation] = useState<Location.LocationObject | null>(null)

  const refreshStatus = useCallback(async () => {
    const result = await Location.getForegroundPermissionsAsync()
    setStatus(result.status)
    if (result.granted) {
      const location = await Location.getCurrentPositionAsync()
      setLocation(location)
    }
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const requestLocation = useCallback(async () => {
    const result = await Location.requestForegroundPermissionsAsync()
    setStatus(result.status)
    if (result.granted) {
      const location = await Location.getCurrentPositionAsync()
      setLocation(location)
    }
    return result
  }, [])

  return {
    locationPermission: status === Location.PermissionStatus.GRANTED,
    location,
    status,
    requestLocation,
    refreshStatus,
  }
}
