import { useState } from 'react'
import { ensureSyncDeviceId } from '@/lib/iCloudIdentity'
import {
  createWebCloudSyncClient,
  WebCloudSyncScreen,
} from '@/app/web-cloud-sync'

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
