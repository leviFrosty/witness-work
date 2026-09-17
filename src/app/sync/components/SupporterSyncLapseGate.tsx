import { useEffect } from 'react'
import { Platform } from 'react-native'
import useCustomer from '@/hooks/useCustomer'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import { analytics } from '@/lib/analytics'

// Wait for RevenueCat before treating false as a lapse. Reset the explicit-choice
// flag so resubscribing can enter the safe first-enable flow again.
export default function SupporterSyncLapseGate() {
  const { customer } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const { iCloudSyncEnabled, set } = usePreferences()
  const supporterStatusKnown = customer !== null

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    if (!supporterStatusKnown) return
    if (isSupporter) return
    if (!iCloudSyncEnabled) return
    set({ iCloudSyncEnabled: false, iCloudSyncSetByUser: false })
    analytics.capture('icloud_sync_enabled_changed', {
      enabled: false,
      source: 'supporter_lapse',
    })
  }, [supporterStatusKnown, isSupporter, iCloudSyncEnabled, set])

  return null
}
