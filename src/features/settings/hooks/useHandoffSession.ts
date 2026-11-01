import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { HandoffSession } from '@/app/account/handoff'
import useAppActive from '@/hooks/useAppActive'
import { syncNow } from '@/lib/syncClock'

export const HANDOFF_POLL_MS = 1500

const noop = () => () => undefined

export function useHandoffState<S extends HandoffSession>(
  session: S | null
): S['state'] | null {
  return useSyncExternalStore(session ? session.subscribe : noop, () =>
    session ? session.state : null
  )
}

export function useHandoffPolling(
  session: HandoffSession | null,
  active: boolean
) {
  const focused = useIsFocused()
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active'
  )

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active')
    )
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!session || !active || !focused || !foreground) return
    void session.poll()
    const timer = setInterval(() => void session.poll(), HANDOFF_POLL_MS)
    return () => clearInterval(timer)
  }, [session, active, focused, foreground])
}

export function useHandoffCountdown(expiresAt: number | null): number | null {
  const [now, setNow] = useState(syncNow)
  const foreground = useAppActive()
  useEffect(() => {
    if (expiresAt === null || !foreground) return
    setNow(syncNow())
    const timer = setInterval(() => setNow(syncNow()), 1000)
    return () => clearInterval(timer)
  }, [expiresAt, foreground])
  return expiresAt === null ? null : Math.max(0, expiresAt - now)
}
