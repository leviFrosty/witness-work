import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { accountKey } from '@/app/account/accountKey'
import { addForegroundListener } from '@/lib/appLifecycle'
import { addReconnectListener } from '@/lib/http/online'
import { onAccountStatus, serverAccount } from '@/lib/serverAccount'
import type { ServerAccountCheck } from '@/lib/serverAccount/serverAccount'
import { logger } from '@/lib/logger'

export type AccountOverview =
  | { state: 'checking'; accountId?: string | null }
  | { state: 'notSetUp' }
  | ServerAccountCheck

export default function useAccountOverview() {
  const [overview, setOverview] = useState<AccountOverview>({
    state: 'checking',
  })
  const latest = useRef(0)

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
