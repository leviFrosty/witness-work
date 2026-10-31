import { useEffect, useState } from 'react'
import Purchases from 'react-native-purchases'
import useCustomer from '@/hooks/useCustomer'
import { appVariant } from '@/lib/appVariant'
import { devBuyGateOverride } from '@/lib/launchAddress'
import { accountSessions, onAccountChange } from '@/lib/serverAccount'
import { useSettledWebRevenueCatId } from '@/features/supporter/lib/webRevenueCatId'

export type WebCheckoutCustomer = {
  /** The RevenueCat customer checkout buys as, or null until it's settled. */
  appUserId: string | null
  /**
   * What Buy still waits for: an account session on this browser, then the
   * account's RevenueCat id settling. Null once neither is missing.
   */
  waitingFor: 'session' | 'settled_id' | null
}

/** Whether this browser has an account session, re-read when it changes. */
const useHasAccountSession = (enabled: boolean): boolean => {
  const [hasSession, setHasSession] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let current = true
    const read = () =>
      accountSessions.ready().then(
        () => current && setHasSession(!!accountSessions.snapshot()?.accountId),
        () => current && setHasSession(false)
      )
    void read()
    const unsubscribe = onAccountChange(() => void read())
    return () => {
      current = false
      unsubscribe()
    }
  }, [enabled])
  return hasSession
}

/**
 * The RevenueCat customer web checkout buys as. Buy waits until this browser
 * has an account session and the account's RevenueCat id has settled from its
 * sync data (docs/web-purchases.md "Buy waits for a settled id"), so it buys as
 * the customer the account's devices agree on.
 *
 * Development builds skip both, so sandbox checkout stays testable on localhost
 * and `app-dev`; there it's the customer the browser is logged in as. On
 * localhost, `?dev_buy_gate=1` keeps the checks, for the web specs.
 */
export function useWebCheckoutCustomer(): WebCheckoutCustomer {
  const development = appVariant === 'development' && !devBuyGateOverride()
  const { ready, customer } = useCustomer()
  const hasSession = useHasAccountSession(!development)
  const settledId = useSettledWebRevenueCatId()
  const waitingFor = development
    ? null
    : !hasSession
      ? 'session'
      : !settledId
        ? 'settled_id'
        : null
  const [appUserId, setAppUserId] = useState<string | null>(null)
  const canAsk = waitingFor === null && ready && !!customer
  useEffect(() => {
    if (!canAsk) return
    let current = true
    Purchases.getAppUserID().then(
      // Outside development, only ever the settled id: a browser still logged
      // in as another customer waits until it has switched.
      (id) =>
        current && setAppUserId(development || id === settledId ? id : null),
      () => current && setAppUserId(null)
    )
    return () => {
      current = false
    }
  }, [canAsk, customer, development, settledId])
  return { appUserId: canAsk ? appUserId : null, waitingFor }
}
