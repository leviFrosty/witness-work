import { useEffect } from 'react'
import useIsSupporter from '@/hooks/useIsSupporter'
import useCustomer from '@/hooks/useCustomer'
import { usePreferences } from '@/stores/preferences'
import { useSupporter } from '@/stores/supporterStatus'

export default function SupporterStoreSync() {
  const { isSupporter } = useIsSupporter()
  const { customer, unavailable } = useCustomer()
  const devSupporterOverride = usePreferences((s) => s.devSupporterOverride)

  const known =
    customer !== null || unavailable || (__DEV__ && !!devSupporterOverride)
  useEffect(() => {
    if (known) useSupporter.getState().setSupporter(isSupporter)
  }, [known, isSupporter])
  return null
}
