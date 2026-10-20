import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

/** Whether the app is in the foreground right now. */
export default function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active')
    )
    return () => subscription.remove()
  }, [])
  return active
}
