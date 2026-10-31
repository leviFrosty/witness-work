import { useEffect } from 'react'
import useIsSupporter from '@/hooks/useIsSupporter'
import useCustomer from '@/hooks/useCustomer'
import { usePreferences } from '@/stores/preferences'
import { useSupporter } from '@/stores/supporterStatus'
import { useServerSupporter } from '@/stores/serverSupporter'
import { useRevenueCatIsOwn } from '@/lib/revenueCatIdentity'

// Mirror context into the store consumed by non-React widget snapshot writers.
export default function SupporterStoreSync() {
  const { isSupporter } = useIsSupporter()
  const { customer, unavailable } = useCustomer()
  // Another account's customer (`useIsSupporter`) says nothing yet.
  const ownCustomer = useRevenueCatIsOwn()
  const devSupporterOverride = usePreferences((s) => s.devSupporterOverride)
  const serverSupporter = useServerSupporter((s) => s.active)
  // Whose answer it is: undefined until the session loads.
  const account = useServerSupporter((s) => s.account)
  // Until RevenueCat answers, the store keeps the last known status rather
  // than reporting a supporter as lapsed. The server's answer is enough to
  // say Supporter once the session confirms it's this account's.
  const known =
    (customer !== null && ownCustomer) ||
    unavailable ||
    (serverSupporter && account !== undefined) ||
    (__DEV__ && !!devSupporterOverride)
  // Another account drops the store (`onAccountSwitched`): set it again.
  useEffect(() => {
    if (known) useSupporter.getState().setSupporter(isSupporter)
  }, [known, isSupporter, account])
  return null
}
