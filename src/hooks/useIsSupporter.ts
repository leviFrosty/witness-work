import useCustomer from '@/hooks/useCustomer'
import { supporterSinceDate } from '@/lib/supporterSince'
import { useRevenueCatIsOwn } from '@/lib/revenueCatIdentity'
import { usePreferences } from '@/stores/preferences'
import { useServerSupporter } from '@/stores/serverSupporter'

export type SupporterStatus = {
  isSupporter: boolean
  since: Date | null
}

/**
 * Canonical supporter check. `isSupporter` is true when the user has an active
 * subscription or a Lifetime Supporter grant; one-time donations do not count
 * (ADR 0014). `since` is the earliest qualifying purchase date.
 *
 * When RevenueCat doesn't say Supporter, ww-api's answer for the account (ADR
 * 0029) does, until it expires (ADR 0040 §7): a purchase under another of the
 * account's RevenueCat customers, or a device without RevenueCat. `since` stays
 * RevenueCat's date, so it's null then. RevenueCat's customer counts only while
 * it's this device's own: after another server account signs in, it's the
 * previous account's until RevenueCat logs in again (`revenueCatIdentity`).
 *
 * When the developer-tools override (`devSupporterOverride`) is set, it
 * short-circuits RevenueCat and forces the user into the supporter state using
 * that date — useful for testing supporter features without real IAP. The
 * override is only honored in dev builds; production bundles ignore it even if
 * the value is present in persisted preferences.
 */
const useIsSupporter = (): SupporterStatus => {
  const { customer } = useCustomer()
  const ownCustomer = useRevenueCatIsOwn()
  const devSupporterOverride = usePreferences((s) => s.devSupporterOverride)
  const serverSupporter = useServerSupporter((s) => s.active)
  if (__DEV__ && devSupporterOverride) {
    return { isSupporter: true, since: new Date(devSupporterOverride) }
  }
  const since = ownCustomer ? supporterSinceDate(customer) : null
  if (since) return { isSupporter: true, since }
  return { isSupporter: serverSupporter, since: null }
}

export default useIsSupporter
