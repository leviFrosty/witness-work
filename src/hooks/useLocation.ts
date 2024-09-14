import { useEffect, useState } from 'react'
import * as Location from 'expo-location'

export default function useLocation() {
  const [locationPermission, setLocationPermission] = useState(false)

  useEffect(() => {
    const getLocation = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()
      if (granted) {
        setLocationPermission(true)
      }
    }

    getLocation()
  }, [])

  return { locationPermission }
}
