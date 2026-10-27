import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

interface AppSwitcherPrivacyNative {
  appSwitcherPrivacyVersion?: number
  setHidden(hidden: boolean): unknown
  /** Version 2 and later, iOS only. */
  reveal?(): unknown
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
  call(() => native.setHidden(hidden))
}

/**
 * Takes the iOS app switcher cover down once the device owner has unlocked App
 * Lock, without waiting for the prompt's success animation to end. It stays up
 * in the background. Android's Recents setting doesn't use a cover.
 */
export function revealAfterUnlock(): void {
  if (Platform.OS !== 'ios') return
  if (!native || (native.appSwitcherPrivacyVersion ?? 0) < 2) return
  call(() => native.reveal?.())
}

function call(run: () => unknown) {
  try {
    const result = run()
    if (result instanceof Promise) void result.catch(() => {})
  } catch {
    // Privacy chrome must never stop the app from opening.
  }
}
