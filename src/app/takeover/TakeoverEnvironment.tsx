import { useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useNavigationState } from '@react-navigation/native'
import '@/app/takeover/policy'
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { useProfileOverlay } from '@/stores/profileOverlay'

function useAppStateStatus() {
  const [state, setState] = useState<AppStateStatus>(AppState.currentState)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setState)
    return () => subscription.remove()
  }, [])
  return state
}

/**
 * Turns what's covering the tabs into takeover holds, so nothing new takes over
 * until it's gone: a sheet or pushed screen above the tabs (`Root` isn't on top
 * of the root stack), the profile overlay, the notification bell's tray, and
 * the app out of the foreground. Going to the background also drops
 * celebrations still waiting; `inactive` (iOS system prompts such as a review
 * request or a permission alert, Notification Center) only holds. Sheets and
 * popovers on the tabs hold for themselves (`Sheet`, `AnchoredPopover`).
 * Mounted once, in HomeTabStack.
 */
export default function TakeoverEnvironment() {
  // The root stack's top screen, not this screen's focus, so a second `Root`
  // (a `navigate('Root')` without `pop: true`) can't hold from underneath.
  const tabsOnTop = useNavigationState(
    (state) => state.routes[state.index]?.name === 'Root'
  )
  const profileOpen = useProfileOverlay((state) => state.open)
  const trayOpen = useNotificationsTray((state) => state.open)
  const appState = useAppStateStatus()
  useTakeoverHold('screen', !tabsOnTop)
  useTakeoverHold('profile', profileOpen)
  useTakeoverHold('tray', trayOpen)
  useTakeoverHold('background', appState === 'background')
  useTakeoverHold('inactive', appState === 'inactive')
  return null
}
