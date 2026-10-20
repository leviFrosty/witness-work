import { useEffect } from 'react'
import { canSync, installiCloudSync } from '@/app/sync/iCloudSync'
import { installCloudSyncRuntime } from '@/app/sync/cloudSync'
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
    const uninstallCloud = registeredCloudSyncTransport()
      ? installCloudSyncRuntime(canSync)
      : () => {}
    return () => {
      settle()
      uninstallCloud()
      uninstallSync()
    }
  }, [storageReady])
}
