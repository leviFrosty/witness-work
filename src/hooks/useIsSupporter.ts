import useCustomer from '@/hooks/useCustomer'
import { supporterSinceDate } from '@/lib/supporterSince'
import { useRevenueCatIsOwn } from '@/lib/revenueCatIdentity'
import { usePreferences } from '@/stores/preferences'
import { useServerSupporter } from '@/stores/serverSupporter'

export type SupporterStatus = {
  isSupporter: boolean
  since: Date | null
}

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
