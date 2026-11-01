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

export default function AppLockGate() {
  const enabled = useAppLockSettings((s) => s.enabled)
  const locked = useAppLockSession((s) => s.locked)
  const availability = useAppLockAvailability()

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

        if (useAppLockSettings.getState().requireAfter === 0) {
          useAppLockSession.setState({ locked: true })
        }
      } else if (state === 'active' && backgroundedAt.current !== null) {
        const awayMs = Date.now() - backgroundedAt.current
        backgroundedAt.current = null
        if (shouldRelock(awayMs, useAppLockSettings.getState().requireAfter)) {
          useAppLockSession.setState({ locked: true })
        }

        if (useAppLockSession.getState().locked) promptUnlock()
      }
    })
    return () => subscription.remove()
  }, [enabled])

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
    <FullWindowOverlay onClose={() => BackHandler.exitApp()}>
      <AppLockScreen
        method={availability?.method ?? 'passcode'}
        onUnlock={promptUnlock}
      />
    </FullWindowOverlay>
  )
}
