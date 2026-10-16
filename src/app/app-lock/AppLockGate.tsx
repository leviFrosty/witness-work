import { useEffect, useRef } from 'react'
import { AppState, BackHandler } from 'react-native'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { useAppLockAvailability } from '@/hooks/useAppLockAvailability'
import i18n from '@/lib/locales'
import { authenticateAppLock, shouldRelock } from '@/lib/appLock'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'
import AppLockScreen from '@/app/app-lock/AppLockScreen'

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
  const prompting = useRef(false)
  useTakeoverHold('appLock', enabled && locked)

  const promptUnlock = async () => {
    if (prompting.current) return
    prompting.current = true
    const result = await authenticateAppLock(i18n.t('appLock_promptMessage'))
    prompting.current = false
    // A device without a passcode has nothing to unlock with; don't trap the
    // user behind the lock.
    if (result !== 'cancelled') unlock()
  }

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

  // Locked while already in the foreground: at launch.
  useEffect(() => {
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
