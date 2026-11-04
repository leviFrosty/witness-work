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

/**
 * The web asks only from the User's tap: browsers want one before a passkey
 * prompt, and an unasked prompt on every return would be a nuisance.
 */
const isWeb = Platform.OS === 'web'

/** The delay that applies here (the web has no Immediately). */
const requireAfter = () =>
  appLockDelayFor(useAppLockSettings.getState().requireAfter, isWeb)

/**
 * Asks for Face ID, Touch ID or the device passcode before showing the app, at
 * launch and when it returns after the chosen delay; on the web, one of the
 * account's passkeys. Above every sheet and screen; on phones, navigation, deep
 * links and sync keep running underneath. On the web nothing does: while it's
 * locked, `WebAppLockBoundary` renders this in place of the app.
 */
export default function AppLockGate() {
  return hasCapability('appLock') ? <DeviceAppLockGate /> : null
}

function DeviceAppLockGate() {
  const enabled = useAppLockSettings((s) => s.enabled)
  const locked = useAppLockSession((s) => s.locked)
  const authenticating = useAppLockSession((s) => s.authenticating)
  const availability = useAppLockAvailability()
  // The web's: why the last unlock didn't open the lock, shown on it.
  const [unlockProblem, setUnlockProblem] = useState<string | null>(null)
  const canUnlockHere = useAppLockSettings(
    (s) => (s.webCredentials?.ids.length ?? 0) > 0
  )
  // A launch in the background (a notification, background sync) counts as
  // away, so the first time it's opened asks to unlock.
  const backgroundedAt = useRef<number | null>(
    AppState.currentState === 'background' ? Date.now() : null
  )
  useTakeoverHold('appLock', enabled && locked)

  // The app switcher and Recents take their picture of the app as it leaves,
  // before the lock screen below can draw, so the platform hides it instead.
  useEffect(() => setAppSwitcherHidden(enabled), [enabled])

  // Nothing under the lock can stutter, so launch work runs straight through
  // while it's up, then gives the unlocked screen a moment to itself.
  useEffect(() => setFirstScreenCovered(enabled && locked), [enabled, locked])

  useEffect(() => {
    if (!enabled) {
      unlock()
      return
    }
    const subscription = AppState.addEventListener('change', (state) => {
      // The prompt itself (and Android's passcode screen) leaves the app, so
      // only a background that isn't ours counts as away. Otherwise a
      // cancelled prompt would bring up another as the app becomes active.
      if (useAppLockSession.getState().authenticating) return
      if (state === 'background') {
        backgroundedAt.current = Date.now()
        // Cover the app before the system snapshots it for the app switcher.
        if (requireAfter() === 0) {
          useAppLockSession.setState({ locked: true })
        }
      } else if (state === 'active' && backgroundedAt.current !== null) {
        const awayMs = Date.now() - backgroundedAt.current
        backgroundedAt.current = null
        if (shouldRelock(awayMs, requireAfter())) {
          useAppLockSession.setState({ locked: true })
        }
        // Each return asks again, even if the last prompt was cancelled.
        if (useAppLockSession.getState().locked && !isWeb) promptUnlock()
      }
    })
    return () => subscription.remove()
  }, [enabled])

  // Locked while already in the foreground: at launch. On iOS that prompt
  // usually went up before the app drew (`promptUnlockAtLaunch`), so the lock
  // screen doesn't ask again as it appears.
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
    <FullWindowOverlay
      // Android's back button leaves the app rather than the lock.
      onClose={() => BackHandler.exitApp()}
    >
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
