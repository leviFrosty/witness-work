import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { accountKey } from '@/app/account/accountKey'
import { addForegroundListener } from '@/lib/appLifecycle'
import { addReconnectListener } from '@/lib/http/online'
import { onAccountStatus, serverAccount } from '@/lib/serverAccount'
import type { ServerAccountCheck } from '@/lib/serverAccount/serverAccount'
import { logger } from '@/lib/logger'

/** What the Account screen shows about the server account. */
export type AccountOverview =
  /** With the number this device last knew, while the server answers. */
  | { state: 'checking'; accountId?: string | null }
  /** No account key on this device yet. */
  | { state: 'notSetUp' }
  | ServerAccountCheck

/**
 * The account's number and status, checked with the server each time the screen
 * comes into view, the app returns to it, or the connection comes back (opening
 * this device's session when there's none), and updated while it's in view when
 * another call finds the status changed (a refusal as suspended, or a
 * reinstatement). Doesn't create an account key: without one, the account isn't
 * set up yet.
 */
export default function useAccountOverview() {
  const [overview, setOverview] = useState<AccountOverview>({
    state: 'checking',
  })
  const latest = useRef(0)

  // Memoized for useFocusEffect, which re-runs whenever its callback changes.
  // `retry` verifies this device again right away (Try Again).
  const refresh = useCallback(async ({ retry = false } = {}) => {
    const run = ++latest.current
    const set = (next: AccountOverview) => {
      if (run === latest.current) setOverview(next)
    }
    try {
      const key = await accountKey.peek()
      if (!key) return set({ state: 'notSetUp' })
      const known = serverAccount.cached(key)
      set({ state: 'checking', accountId: known?.accountId ?? null })
      set(await serverAccount.check(key, { retry }))
    } catch (error) {
      logger.warn('Account check failed', error)
      set({ state: 'offline', accountId: null, lastStatus: null })
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refresh()
      const foreground = addForegroundListener(() => void refresh())
      const reconnect = addReconnectListener(() => void refresh())
      const unsubscribe = onAccountStatus((status) =>
        setOverview((current) =>
          current.state === 'active' || current.state === 'suspended'
            ? { state: status, accountId: current.accountId }
            : current
        )
      )
      return () => {
        foreground.remove()
        reconnect.remove()
        unsubscribe()
      }
    }, [refresh])
  )

  return { overview, refresh }
}
