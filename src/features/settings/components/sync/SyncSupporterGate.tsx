import { ReactNode } from 'react'
import { View } from 'react-native'
import IsSupporter from '@/components/IsSupporter'
import {
  registeredCloudSyncTransport,
  usesCloudSync,
} from '@/lib/syncTransport/provider'
import { usePreferences } from '@/stores/preferences'

/**
 * The Supporter gate on Settings → Sync's screens. While the server offers
 * Cloud Sync to everyone (`sync:entitlement everyone`, ADR 0030) the screen
 * opens for everyone, and only iCloud and Google Drive stay Supporter-only.
 * `cloudOnly` keeps the gate unless this device is on Cloud Sync (the Devices
 * list belongs to the option the device uses).
 */
export default function SyncSupporterGate({
  children,
  cloudOnly = false,
}: {
  children: ReactNode
  cloudOnly?: boolean
}) {
  const open = usePreferences(
    (state) =>
      registeredCloudSyncTransport() !== null &&
      state.cloudSyncConfig?.entitlement === 'everyone' &&
      // Paused by the kill switch, a device on Cloud Sync still sees why.
      (state.cloudSyncConfig.enabled || usesCloudSync()) &&
      (!cloudOnly || usesCloudSync())
  )
  if (open) return <View style={{ gap: 10, flex: 1 }}>{children}</View>
  return (
    <IsSupporter analyticsSurface='icloud_sync' feature='iCloudSync' fill>
      {children}
    </IsSupporter>
  )
}
