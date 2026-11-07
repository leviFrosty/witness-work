import { Platform } from 'react-native'
import * as Device from 'expo-device'

export type DevicePlatform = 'ios' | 'android' | 'web'

export const devicePlatform = (): DevicePlatform =>
  Platform.select<DevicePlatform>({
    ios: 'ios',
    android: 'android',
    default: 'web',
  })

const OPERATING_SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/Linux|X11/, 'Linux'],
]

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]

const firstMatch = (
  userAgent: string,
  table: readonly (readonly [RegExp, string])[]
) => table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null

export function webDeviceName(userAgent: string): string {
  const browser = firstMatch(userAgent, BROWSERS)
  const system = firstMatch(userAgent, OPERATING_SYSTEMS)
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? 'Browser'
}

export function deviceName(): string {
  if (Platform.OS === 'web')
    return typeof navigator === 'undefined'
      ? 'Browser'
      : webDeviceName(navigator.userAgent)
  return (
    Device.modelName || Platform.select({ ios: 'iPhone', default: 'Android' })
  )
}
