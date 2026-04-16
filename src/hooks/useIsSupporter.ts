import { useMemo } from 'react'
import useCustomer from './useCustomer'
import { supporterSinceDate } from '../lib/supporterSince'
import { usePreferences } from '../stores/preferences'

export type SupporterStatus = {
  isSupporter: boolean
  since: Date | null
}

/**
 * Canonical supporter check. `isSupporter` is true when the user has any active
 * subscription entitlement (one-time donations do not count). `since` is the
 * earliest active-entitlement purchase date.
 *
 * When the developer-tools override (`devSupporterOverride`) is set, it
 * short-circuits RevenueCat and forces the user into the supporter state using
 * that date — useful for testing supporter features without real IAP.
 */
const useIsSupporter = (): SupporterStatus => {
  const { customer } = useCustomer()
  const { devSupporterOverride } = usePreferences()
  return useMemo(() => {
    if (devSupporterOverride) {
      return { isSupporter: true, since: new Date(devSupporterOverride) }
    }
    const since = supporterSinceDate(customer)
    return { isSupporter: since !== null, since }
  }, [customer, devSupporterOverride])
}

export default useIsSupporter
