import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import useAppActive from '@/hooks/useAppActive'
import { syncNow } from '@/lib/syncClock'

/** Clients poll this often while a screen shows the handoff (the protocol's). */
export const HANDOFF_POLL_MS = 1500

const noop = () => () => undefined

/** A handoff's or an approval's session, as these hooks use it. */
type Observable = {
  state: unknown
  subscribe: (listener: () => void) => () => void
}

/** The session's state, re-rendering on every change. */
export function useHandoffState<S extends Observable>(
  session: S | null
): S['state'] | null {
  return useSyncExternalStore(session ? session.subscribe : noop, () =>
    session ? session.state : null
  )
}

/**
 * Polls the session every 1.5 s while the screen is focused, the app is in the
 * foreground, and `active` says there's something to wait for.
 */
export function useHandoffPolling(
  session: { poll: () => Promise<void> } | null,
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

/**
 * Milliseconds left until `expiresAt` (server time), ticking each second while
 * the app is in the foreground.
 */
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
