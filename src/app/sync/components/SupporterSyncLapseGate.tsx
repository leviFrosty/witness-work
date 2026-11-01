import { useEffect } from 'react'
import { hasSyncTransport } from '@/lib/syncTransport/platform'
import { usesCloudSync } from '@/lib/syncTransport/provider'
import useCustomer from '@/hooks/useCustomer'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import { analytics } from '@/lib/analytics'

export default function SupporterSyncLapseGate() {
  const { customer } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const iCloudSyncEnabled = usePreferences((s) => s.iCloudSyncEnabled)
  const set = usePreferences((s) => s.set)
  const onCloud = usePreferences(() => usesCloudSync())
  const supporterStatusKnown = customer !== null

  useEffect(() => {
    if (!hasSyncTransport()) return
    if (!supporterStatusKnown) return

    const pausedForLapse = usePreferences.getState().iCloudSyncPausedForLapse
    if (isSupporter || onCloud) {
      if (pausedForLapse) set({ iCloudSyncPausedForLapse: false })
      return
    }
    if (!iCloudSyncEnabled || pausedForLapse) return
    set({ iCloudSyncPausedForLapse: true })
    analytics.capture('icloud_sync_paused', {
      enabled: false,
      source: 'supporter_lapse',
    })
  }, [supporterStatusKnown, isSupporter, onCloud, iCloudSyncEnabled, set])

  return null
}
