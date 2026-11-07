import { useEffect } from 'react'
import { AppState } from 'react-native'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import { iCloudSync } from '@/app/sync/iCloudSync'
import { analytics } from '@/lib/analytics'
import { platformSyncDefaultApplies } from '@/app/sync/syncDefaults'
import { hasSyncTransport, syncTransport } from '@/lib/syncTransport'
import { registeredCloudSyncTransport } from '@/lib/syncTransport/provider'

export const cloudSyncDecidesDefault = (state: {
  syncProvider?: 'cloud' | 'platform' | null
  cloudSyncConfig?: { enabled: boolean } | null
}) =>
  registeredCloudSyncTransport() !== null &&
  state.syncProvider !== 'platform' &&
  (state.cloudSyncConfig == null || state.cloudSyncConfig.enabled)

export default function PlatformSyncDefault() {
  const { isSupporter } = useIsSupporter()
  const {
    iCloudSyncEnabled,
    iCloudSyncSetByUser,
    syncProvider,
    cloudSyncConfig,
    installedBeforeFreeSync,
  } = usePreferences()
  const cloudDecides = cloudSyncDecidesDefault({
    syncProvider,
    cloudSyncConfig,
  })
  const applies = platformSyncDefaultApplies({
    installedBeforeFreeSync,
    isSupporter,
  })

  useEffect(() => {
    if (!hasSyncTransport()) return
    if (!applies) return
    if (iCloudSyncSetByUser) return
    if (iCloudSyncEnabled) return
    if (cloudDecides) return

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
            if (!retrySubs) {
              analytics.capture('icloud_sync_enable_deferred', {
                source: 'supporter_default',
                reason: decision.reason,
              })
              retrySubs = [
                syncTransport().addRemoteChangeListener(() => void attempt()),
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
  }, [applies, iCloudSyncSetByUser, iCloudSyncEnabled, cloudDecides])

  return null
}
