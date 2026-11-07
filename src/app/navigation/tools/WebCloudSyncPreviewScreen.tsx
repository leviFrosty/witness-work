import { useEffect, useState } from 'react'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { accountKey } from '@/app/account/accountKey'
import { toast } from '@/stores/toasts'
import type { RootStackParamList } from '@/types/rootStack'
import {
  createWebCloudSyncClient,
  WebCloudSyncScreen,
  type WebCloudSyncClient,
} from '@/app/web-cloud-sync'

type Props = NativeStackScreenProps<RootStackParamList, 'WebCloudSyncPreview'>

const OLD_PHONE = { platform: 'ios', appVersion: '1.40.0' }

const fixedClient = (
  mode: Exclude<Props['route']['params']['mode'], 'live'>
): WebCloudSyncClient => ({
  listSlots: async () => [],
  listSessions: async () => [
    mode === 'updatePhone' ? OLD_PHONE : { platform: 'ios', appVersion: null },
  ],
  readRequestedAt: async () => (mode === 'turnOn' ? null : Date.now()),
  requestCloudSync: async () => Date.now(),
})

export default function WebCloudSyncPreviewScreen({
  navigation,
  route,
}: Props) {
  const { mode } = route.params
  const [client, setClient] = useState<WebCloudSyncClient | null>(
    mode === 'live' ? null : fixedClient(mode)
  )

  useEffect(() => {
    if (mode !== 'live') return
    let cancelled = false
    void accountKey
      .peek()
      .catch(() => null)
      .then((key) => {
        if (cancelled) return
        if (!key) {
          toast.error('No account key on this phone')
          navigation.goBack()
          return
        }
        setClient(createWebCloudSyncClient(key))
      })
    return () => {
      cancelled = true
    }
  }, [mode, navigation])

  if (!client) return null
  return (
    <WebCloudSyncScreen
      client={client}
      ownSlotId={null}
      onReady={() => {
        toast.success('onReady: another device is on Cloud Sync')
        navigation.goBack()
      }}
      onSignOut={() => {
        toast.info('onSignOut')
        navigation.goBack()
      }}
    />
  )
}
