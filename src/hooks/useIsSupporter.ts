import { useMemo } from 'react'
import useCustomer from '@/hooks/useCustomer'
import { supporterSinceDate } from '@/lib/supporterSince'
import { usePreferences } from '@/stores/preferences'

export type SupporterStatus = {
  isSupporter: boolean
  since: Date | null
}

const useIsSupporter = (): SupporterStatus => {
  const { customer } = useCustomer()
  const devSupporterOverride = usePreferences((s) => s.devSupporterOverride)
  return useMemo(() => {
    if (__DEV__ && devSupporterOverride) {
      return { isSupporter: true, since: new Date(devSupporterOverride) }
    }
    const since = supporterSinceDate(customer)
    return { isSupporter: since !== null, since }
  }, [customer, devSupporterOverride])
}

export default useIsSupporter
