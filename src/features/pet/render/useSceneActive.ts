import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useIsFocused } from '@react-navigation/native'

/** Whether a pet scene should animate: its screen is focused and the app is up. */
export default function useSceneActive(paused = false): boolean {
  const focused = useIsFocused()
  const [foreground, setForeground] = useState(
    () => AppState.currentState === 'active'
  )
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active')
    )
    return () => subscription.remove()
  }, [])
  return focused && foreground && !paused
}
