import { useEffect } from 'react'
import { canSync, installiCloudSync } from '@/app/sync/iCloudSync'
import { installCloudSyncRuntime } from '@/app/sync/cloudSync'
import { installCloudSyncRequest } from '@/app/sync/cloudSyncRequest'
import { settleSyncProvider } from '@/app/sync/syncOption'
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
    // reads; installed first, so it hears the launch read.
    const uninstallRequest = cloud ? installCloudSyncRequest() : () => {}
    const uninstallCloud = cloud ? installCloudSyncRuntime(canSync) : () => {}
    return () => {
      settle()
      uninstallRequest()
      uninstallCloud()
      uninstallSync()
    }
  }, [storageReady])
}
