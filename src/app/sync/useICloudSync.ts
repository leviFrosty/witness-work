import { useEffect } from 'react'
import {
  canSync,
  flushPendingPush,
  installiCloudSync,
} from '@/app/sync/iCloudSync'
import { installCloudSyncRuntime } from '@/app/sync/cloudSync'
import { installCloudSyncRequest } from '@/app/sync/cloudSyncRequest'
import { settleSyncProvider } from '@/app/sync/syncOption'
import { resetCompletePull } from '@/lib/cloudSyncPullSettled'
import { webAccount } from '@/lib/serverAccount'
import { cloudSyncOnly } from '@/lib/syncTransport/platform'
import { registeredCloudSyncTransport } from '@/lib/syncTransport/provider'
import { usePreferences } from '@/stores/preferences'

export function useICloudSync(storageReady: boolean | undefined) {
  useEffect(() => {
    if (!storageReady) return
    // A device already on iCloud or Drive keeps it (ADR 0030 §3).
    settleSyncProvider()
    const settle = usePreferences.subscribe((state, previous) => {
      if (state.iCloudSyncEnabled && !previous.iCloudSyncEnabled)
        settleSyncProvider()
    })
    const uninstallSync = installiCloudSync()
    const cloud = registeredCloudSyncTransport() !== null
    // Answers the account's Cloud Sync request from the status the runtime
    // reads; installed first, so it hears the launch read. The request asks
    // phones; a browser is already on Cloud Sync.
    const uninstallRequest =
      cloud && !cloudSyncOnly() ? installCloudSyncRequest() : () => {}
    const uninstallCloud = cloud ? installCloudSyncRuntime(canSync) : () => {}
    // Signing out wipes this browser: an edit still waiting goes up first,
    // into the slot signing out keeps.
    const uninstallSignOut =
      webAccount?.beforeSignOut(async () => {
        await flushPendingPush('sign-out')
        resetCompletePull()
      }) ?? (() => {})
    return () => {
      settle()
      uninstallSignOut()
      uninstallRequest()
      uninstallCloud()
      uninstallSync()
    }
  }, [storageReady])
}
