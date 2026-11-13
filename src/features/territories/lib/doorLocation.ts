import * as Location from 'expo-location'
import type { Coordinate } from '@/types/contact'

export const currentDoorCoordinate = async (): Promise<
  Coordinate | undefined
> => {
  try {
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    })
    return { latitude: coords.latitude, longitude: coords.longitude }
  } catch {
    return undefined
  }
}
