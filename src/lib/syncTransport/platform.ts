import { Platform } from 'react-native'

export function hasSyncTransport(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android'
}
