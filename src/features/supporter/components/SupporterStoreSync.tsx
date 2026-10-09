import { useEffect } from 'react'
import useIsSupporter from '@/hooks/useIsSupporter'
import useCustomer from '@/hooks/useCustomer'
import { usePreferences } from '@/stores/preferences'
import { useSupporter } from '@/stores/supporterStatus'

// Mirror context into the store consumed by non-React widget snapshot writers.
export default function SupporterStoreSync() {
  const { isSupporter } = useIsSupporter()
  const { customer, unavailable } = useCustomer()
  const devSupporterOverride = usePreferences((s) => s.devSupporterOverride)
  // Until RevenueCat answers, the store keeps the last known status rather
  // than reporting a supporter as lapsed.
  const known =
    customer !== null || unavailable || (__DEV__ && !!devSupporterOverride)
  useEffect(() => {
    if (known) useSupporter.getState().setSupporter(isSupporter)
  }, [known, isSupporter])
  return null
}
