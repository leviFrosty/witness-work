import { Platform } from 'react-native'
import * as Device from 'expo-device'

/**
 * What ww-api and the other devices are told this device is. The web is its own
 * platform: it never reads as iOS (ADR 0037 §9).
 */
export type DevicePlatform = 'ios' | 'android' | 'web'

export const devicePlatform = (): DevicePlatform =>
  Platform.select<DevicePlatform>({
    ios: 'ios',
    android: 'android',
    default: 'web',
  })

/** The OS a user agent names, as a person says it. */
const OPERATING_SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/Linux|X11/, 'Linux'],
]

/** Edge, Opera and Samsung Internet say "Chrome" too, so they come first. */
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

/**
 * What a browser calls itself in a device list: "Safari on Mac", or just the
 * browser (or the OS) when the user agent names only one of them.
 */
export function webDeviceName(userAgent: string): string {
  const browser = firstMatch(userAgent, BROWSERS)
  const system = firstMatch(userAgent, OPERATING_SYSTEMS)
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? 'Browser'
}

/** The name this device shows in a device list, only inside ciphertext. */
export function deviceName(): string {
  if (Platform.OS === 'web')
    return typeof navigator === 'undefined'
      ? 'Browser'
      : webDeviceName(navigator.userAgent)
  return (
    Device.modelName || Platform.select({ ios: 'iPhone', default: 'Android' })
  )
}
