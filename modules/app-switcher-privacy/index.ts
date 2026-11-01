import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

interface AppSwitcherPrivacyNative {
  appSwitcherPrivacyVersion?: number
  setHidden(hidden: boolean): unknown

  reveal?(): unknown
}

const native =
  requireOptionalNativeModule<AppSwitcherPrivacyNative>('AppSwitcherPrivacy')

export function setAppSwitcherHidden(hidden: boolean): void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return
  if (!native || (native.appSwitcherPrivacyVersion ?? 0) < 1) return
  call(() => native.setHidden(hidden))
}

export function revealAfterUnlock(): void {
  if (Platform.OS !== 'ios') return
  if (!native || (native.appSwitcherPrivacyVersion ?? 0) < 2) return
  call(() => native.reveal?.())
}

function call(run: () => unknown) {
  try {
    const result = run()
    if (result instanceof Promise) void result.catch(() => {})
  } catch {}
}
