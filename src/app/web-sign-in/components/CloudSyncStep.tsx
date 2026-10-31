import { useState } from 'react'
import { ensureSyncDeviceId } from '@/lib/iCloudIdentity'
import {
  createWebCloudSyncClient,
  WebCloudSyncScreen,
} from '@/app/web-cloud-sync'

/**
 * After signing in, the web's Cloud Sync screen (ADR 0040 §5), with one client
 * for as long as it shows.
 */
export default function CloudSyncStep({
  accountKey,
  onReady,
  onSignOut,
}: {
  accountKey: Uint8Array
  onReady: () => void
  onSignOut: () => void
}) {
  const [client] = useState(() => createWebCloudSyncClient(accountKey))
  const [ownSlotId] = useState(ensureSyncDeviceId)
  return (
    <WebCloudSyncScreen
      client={client}
      ownSlotId={ownSlotId}
      onReady={onReady}
      onSignOut={onSignOut}
    />
  )
}
