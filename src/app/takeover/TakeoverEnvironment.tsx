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

export default function TakeoverEnvironment() {
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
