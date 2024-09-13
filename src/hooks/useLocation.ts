import { useEffect, useState } from 'react'
import * as Location from 'expo-location'

export default function useLocation() {
  const [locationPermission, setLocationPermission] = useState(false)
  const [location, setLocation] = useState<Location.LocationObject | null>(null)

  useEffect(() => {
    const getLocation = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()
      if (granted) {
        setLocationPermission(true)
        const location = await Location.getCurrentPositionAsync()
        setLocation(location)
      }
    }

    getLocation()
  }, [])

  return { locationPermission, location }
}
