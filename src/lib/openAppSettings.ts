import { Linking } from 'react-native'

export async function openAppSettings(): Promise<void> {
  if (typeof Linking.openSettings !== 'function') return
  await Linking.openSettings()
}
