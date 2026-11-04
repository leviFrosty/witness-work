import type { PropsWithChildren } from 'react'
import { Platform } from 'react-native'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'
import AppLockGate from '@/app/app-lock/AppLockGate'
import WebSignInRoot from '@/app/web-sign-in/WebSignInRoot'

const isWeb = Platform.OS === 'web'

/**
 * The web's App Lock renders in place of the app, not over it: while it's
 * locked, none of the app's navigation, screens or data is mounted, so nothing
 * of it reaches the page, its accessibility tree, a click, or a link opened
 * meanwhile (which the app opens once unlocked, from the page's address).
 * Phones keep their lock above the running app (`AppLockGate`).
 */
export default function WebAppLockBoundary({ children }: PropsWithChildren) {
  const locked = useAppLockSession((s) => s.locked)
  const enabled = useAppLockSettings((s) => s.enabled)
  if (!isWeb || !enabled || !locked) return children
  return (
    <WebSignInRoot>
      <AppLockGate />
    </WebSignInRoot>
  )
}
