import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import TerritoryPersonAvatar from '@/features/territories/components/sharing/TerritoryPersonAvatar'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'
import { receivedFromText } from '@/features/territories/lib/territoryTitle'
import type { Territory } from '@/features/territories/types/territory'

export default function StreetReceivedFrom({
  territory,
}: {
  territory: Territory
}) {
  const theme = useTheme()
  const { buddies } = useTerritorySharing()
  const text = receivedFromText(territory)
  const from = territory.received?.from
  if (!text || !from) return null
  const buddy = buddies.find((entry) => entry.inboxId === from.inboxId)
  return (
    <View
      testID='street-received-from'
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 5,
      }}
    >
      <TerritoryPersonAvatar
        name={from.name}
        avatar={buddy?.avatar}
        color={buddy?.color}
        size={28}
      />
      <Text style={{ flex: 1, color: theme.colors.textAlt }}>{text}</Text>
    </View>
  )
}
