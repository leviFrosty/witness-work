import useCloudSyncSupported from '@/hooks/useCloudSyncSupported'
import { registeredCloudSyncTransport } from '@/lib/syncTransport/provider'

export default function useDeviceSyncAvailable(): boolean {
  const cloudSyncSupported = useCloudSyncSupported()
  return cloudSyncSupported || registeredCloudSyncTransport() !== null
}
