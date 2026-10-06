import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Tells the User that saving this Plan answers a buddy's request to join, so
 * it's clear before they reach the invitations at the bottom of the form.
 */
export default function JoinRequestBanner({
  inboxIds,
}: {
  inboxIds: string[]
}) {
  const theme = useTheme()
  const allBuddies = useBuddies((state) => state.buddies)
  const buddies = allBuddies.filter((buddy) => inboxIds.includes(buddy.inboxId))
  const [first] = buddies
  if (!first) return null

  return (
    <XView
      style={{
        gap: 10,
        padding: 12,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.accentTranslucent,
        alignItems: 'center',
      }}
    >
      <BuddyAvatar
        avatar={first.avatar}
        name={first.name}
        color={first}
        size={24}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text }}>
          {i18n.t('buddies_joinRequestBanner', {
            name: buddies.map((buddy) => buddy.name).join(', '),
          })}
        </Text>
      </View>
    </XView>
  )
}
