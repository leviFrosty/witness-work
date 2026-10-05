import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

const TICK_MS = 60 * 1000

/**
 * The current time for deriving what's due, refreshed every minute and on
 * returning to the app, so a Follow-up that just passed (or a cutoff that just
 * closed) shows without a relaunch. `refresh` forces an update, e.g. when the
 * tray opens.
 */
export default function useNow() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now())
    })
    return () => {
      clearInterval(interval)
      subscription.remove()
    }
  }, [])

  return { now, refresh: () => setNow(Date.now()) }
}
