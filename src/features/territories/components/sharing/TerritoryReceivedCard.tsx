import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import TerritoryPersonAvatar from '@/features/territories/components/sharing/TerritoryPersonAvatar'
import useLeaveReceived from '@/features/territories/hooks/useLeaveReceived'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'
import { isReceivedLive } from '@/features/territories/lib/sharing'
import type { Territory } from '@/features/territories/types/territory'

export default function TerritoryReceivedCard({
  territory,
}: {
  territory: Territory
}) {
  const theme = useTheme()
  const confirmLeave = useLeaveReceived(territory)
  const { buddies } = useTerritorySharing()
  const received = territory.received
  if (!received) return null

  const { from } = received
  const buddy = buddies.find((entry) => entry.inboxId === from.inboxId)
  const live = isReceivedLive(territory)
  const handoff = received.kind === 'handoff'

  const text = !live
    ? i18n.t('territories.share.receivedEnded_description', {
        name: from.name,
      })
    : handoff
      ? i18n.t('territories.share.handedBy', {
          name: from.name,
          date: formatDate(received.at, { style: 'medium' }),
        })
      : i18n.t('territories.share.sharedBy', { name: from.name })

  return (
    <Card
      testID='territory-received-card'
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <TerritoryPersonAvatar
        name={from.name}
        avatar={buddy?.avatar}
        color={buddy?.color}
        size={40}
      />
      <Text style={{ flex: 1, fontFamily: theme.fonts.semiBold }}>{text}</Text>
      <View>
        <Button
          variant='outline'
          onPress={confirmLeave}
          testID='territory-received-leave'
          style={{
            minHeight: 44,
            paddingHorizontal: 14,
            justifyContent: 'center',
            borderRadius: 22,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {!live
              ? i18n.t('territories.share.removeFromList')
              : handoff
                ? i18n.t('territories.share.giveBack')
                : i18n.t('territories.share.leave')}
          </Text>
        </Button>
      </View>
    </Card>
  )
}
