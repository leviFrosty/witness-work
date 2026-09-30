import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import { iCloudSync } from '@/app/sync/iCloudSync'
import { analytics } from '@/lib/analytics'
import * as ICloudBridge from '../../../../modules/icloud-bridge'

// Auto-enable only before an explicit user choice. Conflicts stay disabled
// until the user resolves them in Settings through FirstEnableSheet.
export default function SupporterSyncDefault() {
  const { isSupporter } = useIsSupporter()
  const { iCloudSyncEnabled, iCloudSyncSetByUser } = usePreferences()

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    if (!isSupporter) return
    if (iCloudSyncSetByUser) return
    if (iCloudSyncEnabled) return

    // Only `incomplete` decides again; every other outcome is final here.
    let settled = false
    let running = false
    let again = false
    let retrySubs: Array<{ remove: () => void }> | null = null
    const settle = () => {
      settled = true
      retrySubs?.forEach((sub) => sub.remove())
      retrySubs = null
    }
    const attempt = async () => {
      if (settled) return
      if (running) {
        again = true
        return
      }
      running = true
      try {
        const decision = await iCloudSync.resolveInitialEnable()
        if (settled) return
        analytics.capture('icloud_sync_auto_enable_outcome', {
          outcome: decision.outcome,
        })
        switch (decision.outcome) {
          case 'seed':
            settle()
            await iCloudSync.applySeedEnable('supporter_default')
            return
          case 'pull':
            settle()
            iCloudSync.applyPullEnable(decision.remote, 'supporter_default')
            return
          case 'incomplete':
            // Seeding now could push this device's onboarding defaults over
            // a backup still on its way in. Pending files stay unobserved,
            // so the metadata query reports them once they land — decide
            // again then, or at the next foreground (a slow initial scan of
            // an empty container reports nothing).
            if (!retrySubs) {
              analytics.capture('icloud_sync_enable_deferred', {
                source: 'supporter_default',
                reason: decision.reason,
              })
              retrySubs = [
                ICloudBridge.addRemoteChangeListener(() => void attempt()),
                AppState.addEventListener('change', (state) => {
                  if (state === 'active') void attempt()
                }),
              ]
            }
            return
          case 'conflict':
            usePreferences.getState().set({ iCloudSyncNeedsResolution: true })
            settle()
            return
          case 'unavailable':
            settle()
            return
        }
      } catch {
        analytics.capture('icloud_sync_auto_enable_outcome', {
          outcome: 'failed',
        })
        settle()
      } finally {
        running = false
        if (again) {
          again = false
          void attempt()
        }
      }
    }
    void attempt()

    return settle
  }, [isSupporter, iCloudSyncSetByUser, iCloudSyncEnabled])

  return null
}
