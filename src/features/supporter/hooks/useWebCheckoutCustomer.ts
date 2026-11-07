import { useEffect, useState } from 'react'
import Purchases from 'react-native-purchases'
import useCustomer from '@/hooks/useCustomer'
import { appVariant } from '@/lib/appVariant'
import { devBuyGateOverride } from '@/lib/launchAddress'
import { accountSessions, onAccountChange } from '@/lib/serverAccount'
import { useSettledWebRevenueCatId } from '@/features/supporter/lib/webRevenueCatId'

export type WebCheckoutCustomer = {
  appUserId: string | null

  waitingFor: 'session' | 'settled_id' | null
}

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
      (id) =>
        current && setAppUserId(development || id === settledId ? id : null),
      () => current && setAppUserId(null)
    )
    return () => {
      current = false
    }
  }, [canAsk, customer, development, settledId])

  const current = development || appUserId === settledId
  return { appUserId: canAsk && current ? appUserId : null, waitingFor }
}
