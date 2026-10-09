import { useEffect } from 'react'
import { hasSyncTransport } from '@/lib/syncTransport/platform'
import useCustomer from '@/hooks/useCustomer'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import { analytics } from '@/lib/analytics'

// Wait for RevenueCat and preserve the sync choice so access can resume safely.
export default function SupporterSyncLapseGate() {
  const { customer } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const iCloudSyncEnabled = usePreferences((s) => s.iCloudSyncEnabled)
  const set = usePreferences((s) => s.set)
  const supporterStatusKnown = customer !== null

  useEffect(() => {
    if (!hasSyncTransport()) return
    if (!supporterStatusKnown) return
    // Writes (and reports) only when the pause actually changes, not on every
    // launch.
    const pausedForLapse = usePreferences.getState().iCloudSyncPausedForLapse
    if (isSupporter) {
      if (pausedForLapse) set({ iCloudSyncPausedForLapse: false })
      return
    }
    if (!iCloudSyncEnabled || pausedForLapse) return
    set({ iCloudSyncPausedForLapse: true })
    analytics.capture('icloud_sync_paused', {
      enabled: false,
      source: 'supporter_lapse',
    })
  }, [supporterStatusKnown, isSupporter, iCloudSyncEnabled, set])

  return null
}
