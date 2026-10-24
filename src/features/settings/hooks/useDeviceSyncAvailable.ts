import useCloudSyncSupported from '@/hooks/useCloudSyncSupported'
import { registeredCloudSyncTransport } from '@/lib/syncTransport/provider'

/**
 * Whether this device can open Device Sync. Cloud Sync needs neither iCloud nor
 * Google Play services, so it alone is enough.
 */
export default function useDeviceSyncAvailable(): boolean {
  const cloudSyncSupported = useCloudSyncSupported()
  return cloudSyncSupported || registeredCloudSyncTransport() !== null
}
