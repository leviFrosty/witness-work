import { Platform } from 'react-native'

/**
 * Whether this platform has a cloud sync transport: iCloud on iOS, Google Drive
 * on Android. Free of the transports' imports, for code that only gates on the
 * platform.
 */
export function hasSyncTransport(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android'
}
