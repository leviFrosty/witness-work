import { useEffect } from 'react'
import { Platform } from 'react-native'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import { iCloudSync } from '@/app/sync/iCloudSync'

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

    let cancelled = false
    void (async () => {
      const decision = await iCloudSync.resolveInitialEnable()
      if (cancelled) return
      switch (decision.outcome) {
        case 'seed':
          await iCloudSync.applySeedEnable('supporter_default')
          return
        case 'pull':
          iCloudSync.applyPullEnable(decision.remote, 'supporter_default')
          return
        case 'conflict':
        case 'unavailable':
          return
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isSupporter, iCloudSyncSetByUser, iCloudSyncEnabled])

  return null
}
