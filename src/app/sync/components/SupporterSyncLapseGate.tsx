import { useEffect } from 'react'
import { Platform } from 'react-native'
import useCustomer from '@/hooks/useCustomer'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import { analytics } from '@/lib/analytics'

// Wait for RevenueCat and preserve the sync choice so access can resume safely.
export default function SupporterSyncLapseGate() {
  const { customer } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const { iCloudSyncEnabled, set } = usePreferences()
  const supporterStatusKnown = customer !== null

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    if (!supporterStatusKnown) return
    if (isSupporter) {
      set({ iCloudSyncPausedForLapse: false })
      return
    }
    if (!iCloudSyncEnabled) return
    set({ iCloudSyncPausedForLapse: true })
    analytics.capture('icloud_sync_paused', {
      enabled: false,
      source: 'supporter_lapse',
    })
  }, [supporterStatusKnown, isSupporter, iCloudSyncEnabled, set])

  return null
}
