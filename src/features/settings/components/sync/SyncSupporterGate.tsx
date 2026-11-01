import { ReactNode } from 'react'
import { View } from 'react-native'
import IsSupporter from '@/components/IsSupporter'
import {
  registeredCloudSyncTransport,
  usesCloudSync,
} from '@/lib/syncTransport/provider'
import { usePreferences } from '@/stores/preferences'

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
