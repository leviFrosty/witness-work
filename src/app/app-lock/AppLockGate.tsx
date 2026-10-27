import { useEffect, useRef } from 'react'
import { AppState, BackHandler } from 'react-native'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { useAppLockAvailability } from '@/hooks/useAppLockAvailability'
import { shouldRelock } from '@/lib/appLock'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'
import AppLockScreen from '@/app/app-lock/AppLockScreen'
import { promptUnlock, wasAskedAtLaunch } from '@/app/app-lock/unlock'
import { setFirstScreenCovered } from '@/app/launch/useAfterLaunch'
import { setAppSwitcherHidden } from '../../../modules/app-switcher-privacy'

const unlock = () => useAppLockSession.setState({ locked: false })

/**
 * Asks for Face ID, Touch ID or the device passcode before showing the app, at
 * launch and when it returns after the chosen delay. Above every sheet and
 * screen; navigation, deep links and sync keep running underneath.
 */
export default function AppLockGate() {
  const enabled = useAppLockSettings((s) => s.enabled)
  const locked = useAppLockSession((s) => s.locked)
  const availability = useAppLockAvailability()
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
        if (useAppLockSettings.getState().requireAfter === 0) {
          useAppLockSession.setState({ locked: true })
        }
      } else if (state === 'active' && backgroundedAt.current !== null) {
        const awayMs = Date.now() - backgroundedAt.current
        backgroundedAt.current = null
        if (shouldRelock(awayMs, useAppLockSettings.getState().requireAfter)) {
          useAppLockSession.setState({ locked: true })
        }
        // Each return asks again, even if the last prompt was cancelled.
        if (useAppLockSession.getState().locked) promptUnlock()
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
      <AppLockScreen
        method={availability?.method ?? 'passcode'}
        onUnlock={promptUnlock}
      />
    </FullWindowOverlay>
  )
}
