import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

interface AppSwitcherPrivacyNative {
  appSwitcherPrivacyVersion?: number
  setHidden(hidden: boolean): unknown
}

const native =
  requireOptionalNativeModule<AppSwitcherPrivacyNative>('AppSwitcherPrivacy')

/**
 * Hides the app's screen in the iOS app switcher and Android Recents (Android
 * 13 and later) while `hidden`. A no-op on binaries without the module, which
 * OTA updates can run against.
 */
export function setAppSwitcherHidden(hidden: boolean): void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return
  if (!native || (native.appSwitcherPrivacyVersion ?? 0) < 1) return
  try {
    const result = native.setHidden(hidden)
    if (result instanceof Promise) void result.catch(() => {})
  } catch {
    // Privacy chrome must never stop the app from opening.
  }
}
