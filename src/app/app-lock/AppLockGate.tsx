import { useEffect, useRef, useState } from 'react'
import { AppState, BackHandler, Platform } from 'react-native'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { useAppLockAvailability } from '@/hooks/useAppLockAvailability'
import { shouldRelock } from '@/lib/appLock'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import {
  appLockDelayFor,
  useAppLockSession,
  useAppLockSettings,
} from '@/stores/appLock'
import AppLockScreen from '@/app/app-lock/AppLockScreen'
import {
  promptUnlock,
  unlockWebAppLock,
  wasAskedAtLaunch,
} from '@/app/app-lock/unlock'
import { confirmWebSignOut } from '@/app/web-sign-in/confirmWebSignOut'
import { setFirstScreenCovered } from '@/app/launch/useAfterLaunch'
import { setAppSwitcherHidden } from '../../../modules/app-switcher-privacy'

const unlock = () => useAppLockSession.setState({ locked: false })

const isWeb = Platform.OS === 'web'

const requireAfter = () =>
  appLockDelayFor(useAppLockSettings.getState().requireAfter, isWeb)

export default function AppLockGate() {
  return hasCapability('appLock') ? <DeviceAppLockGate /> : null
}

function DeviceAppLockGate() {
  const enabled = useAppLockSettings((s) => s.enabled)
  const locked = useAppLockSession((s) => s.locked)
  const authenticating = useAppLockSession((s) => s.authenticating)
  const availability = useAppLockAvailability()

  const [unlockProblem, setUnlockProblem] = useState<string | null>(null)
  const canUnlockHere = useAppLockSettings(
    (s) => (s.webCredentials?.ids.length ?? 0) > 0
  )

  const backgroundedAt = useRef<number | null>(
    AppState.currentState === 'background' ? Date.now() : null
  )
  useTakeoverHold('appLock', enabled && locked)

  useEffect(() => setAppSwitcherHidden(enabled), [enabled])

  useEffect(() => setFirstScreenCovered(enabled && locked), [enabled, locked])

  useEffect(() => {
    if (!enabled) {
      unlock()
      return
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (useAppLockSession.getState().authenticating) return
      if (state === 'background') {
        backgroundedAt.current = Date.now()

        if (requireAfter() === 0) {
          useAppLockSession.setState({ locked: true })
        }
      } else if (state === 'active' && backgroundedAt.current !== null) {
        const awayMs = Date.now() - backgroundedAt.current
        backgroundedAt.current = null
        if (shouldRelock(awayMs, requireAfter())) {
          useAppLockSession.setState({ locked: true })
        }

        if (useAppLockSession.getState().locked && !isWeb) promptUnlock()
      }
    })
    return () => subscription.remove()
  }, [enabled])

  const mounting = useRef(true)
  useEffect(() => {
    const launch = mounting.current
    mounting.current = false
    if (launch && wasAskedAtLaunch()) return
    if (isWeb) return
    if (enabled && locked && AppState.currentState === 'active') {
      promptUnlock()
    }
  }, [enabled, locked])

  if (!enabled || !locked) return null

  return (
    <FullWindowOverlay onClose={() => BackHandler.exitApp()}>
      {isWeb ? (
        <AppLockScreen
          method='passkey'
          onUnlock={() => {
            setUnlockProblem(null)
            void unlockWebAppLock().then(setUnlockProblem)
          }}
          unlocking={authenticating}
          canUnlock={canUnlockHere}
          problem={
            unlockProblem ??
            (canUnlockHere ? null : i18n.t('webAppLock_noKeptPasskey'))
          }
          onSignOut={() =>
            confirmWebSignOut({
              onStarted: () => setUnlockProblem(null),
              onFailed: () => setUnlockProblem(i18n.t('webSignOut_failed')),
            })
          }
        />
      ) : (
        <AppLockScreen
          method={availability?.method ?? 'passcode'}
          onUnlock={promptUnlock}
        />
      )}
    </FullWindowOverlay>
  )
}
