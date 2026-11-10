import { Platform } from 'react-native'
import * as Device from 'expo-device'
import { webDeviceName } from '@/lib/webDeviceName'

export type DevicePlatform = 'ios' | 'android' | 'web'

export const devicePlatform = (): DevicePlatform =>
  Platform.select<DevicePlatform>({
    ios: 'ios',
    android: 'android',
    default: 'web',
  })

export function deviceName(): string {
  if (Platform.OS === 'web')
    return webDeviceName(typeof navigator === 'undefined' ? {} : navigator)
  return (
    Device.modelName || Platform.select({ ios: 'iPhone', default: 'Android' })
  )
}

export const syncDeviceName = (): string | null =>
  Platform.OS === 'web' ? deviceName() : Device.modelName
