import * as Location from 'expo-location'
import type { Coordinate } from '@/types/contact'

export const doorLocationAllowed = async (): Promise<boolean> => {
  try {
    return (await Location.getForegroundPermissionsAsync()).granted
  } catch {
    return false
  }
}

export const currentDoorCoordinate = async (): Promise<
  Coordinate | undefined
> => {
  try {
    if (!(await doorLocationAllowed())) return undefined
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    })
    return { latitude: coords.latitude, longitude: coords.longitude }
  } catch {
    return undefined
  }
}

export const askDoorLocation = async (): Promise<{
  granted: boolean
  canAskAgain: boolean
}> => {
  try {
    const { granted, canAskAgain } =
      await Location.requestForegroundPermissionsAsync()
    return { granted, canAskAgain }
  } catch {
    return { granted: false, canAskAgain: false }
  }
}

export type DoorLocationAccess = {
  access: 'granted' | 'ask' | 'denied'
  canAskAgain: boolean
}

export const doorLocationAccess = async (): Promise<DoorLocationAccess> => {
  try {
    const { status, canAskAgain } =
      await Location.getForegroundPermissionsAsync()
    return {
      access:
        status === 'granted'
          ? 'granted'
          : status === 'undetermined'
            ? 'ask'
            : 'denied',
      canAskAgain,
    }
  } catch {
    return { access: 'denied', canAskAgain: false }
  }
}
