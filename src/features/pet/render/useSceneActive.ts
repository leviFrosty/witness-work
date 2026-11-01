import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useIsFocused } from '@react-navigation/native'

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
