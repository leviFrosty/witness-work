import { Linking } from 'react-native'

/**
 * Opens this app's page in the system Settings, to change a permission. A
 * browser has no such page (a site's permissions are the User's to change in
 * the address bar), so there it does nothing rather than throw.
 */
export async function openAppSettings(): Promise<void> {
  if (typeof Linking.openSettings !== 'function') return
  await Linking.openSettings()
}
