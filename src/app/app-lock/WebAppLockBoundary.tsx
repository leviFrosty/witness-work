import type { PropsWithChildren } from 'react'
import { Platform } from 'react-native'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'
import AppLockGate from '@/app/app-lock/AppLockGate'
import WebSignInRoot from '@/app/web-sign-in/WebSignInRoot'

const isWeb = Platform.OS === 'web'

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
