import { useNavigation } from '@react-navigation/native'
import { Globe as GlobeIcon } from 'lucide-react-native'
import type { RootStackNavigation } from '@/types/rootStack'
import { ToolList, ToolRow, ToolSection } from '@/app/navigation/tools/ToolsUI'

/**
 * Tools → Web Cloud Sync: the screen a browser shows after signing in to an
 * account whose devices aren't on Cloud Sync (ADR 0040 §5), on this phone.
 */
export default function WebCloudSyncTools() {
  const navigation = useNavigation<RootStackNavigation>()
  return (
    <ToolSection
      title='Web Cloud Sync'
      icon={GlobeIcon}
      info='The web’s Cloud Sync screen. Live reads this phone’s account as a browser with no slot of its own would: Turn On sets the account’s request on ww-api, and the wait ends once any device’s slot is there (this phone answers the request at its next status read). The others hold one state with made-up answers.'
    >
      <ToolList>
        <ToolRow
          label='Live (this account)'
          onPress={() =>
            navigation.navigate('WebCloudSyncPreview', { mode: 'live' })
          }
        />
        <ToolRow
          label='Turn on'
          onPress={() =>
            navigation.navigate('WebCloudSyncPreview', { mode: 'turnOn' })
          }
        />
        <ToolRow
          label='Waiting'
          onPress={() =>
            navigation.navigate('WebCloudSyncPreview', { mode: 'waiting' })
          }
        />
        <ToolRow
          label='Update your phone'
          onPress={() =>
            navigation.navigate('WebCloudSyncPreview', { mode: 'updatePhone' })
          }
        />
      </ToolList>
    </ToolSection>
  )
}
