import { useEffect } from 'react'
import useIsSupporter from '@/hooks/useIsSupporter'
import useCustomer from '@/hooks/useCustomer'
import { usePreferences } from '@/stores/preferences'
import { useSupporter } from '@/stores/supporterStatus'
import { useServerSupporter } from '@/stores/serverSupporter'
import { useRevenueCatIsOwn } from '@/lib/revenueCatIdentity'

export default function SupporterStoreSync() {
  const { isSupporter } = useIsSupporter()
  const { customer, unavailable } = useCustomer()

  const ownCustomer = useRevenueCatIsOwn()
  const devSupporterOverride = usePreferences((s) => s.devSupporterOverride)
  const serverSupporter = useServerSupporter((s) => s.active)

  const account = useServerSupporter((s) => s.account)

  const known =
    (customer !== null && ownCustomer) ||
    unavailable ||
    (serverSupporter && account !== undefined) ||
    (__DEV__ && !!devSupporterOverride)

  useEffect(() => {
    if (known) useSupporter.getState().setSupporter(isSupporter)
  }, [known, isSupporter, account])
  return null
}
