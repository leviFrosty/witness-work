import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import ContextMenu from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import type { BuddyShareRef } from '@/types/timeEntry'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'

/**
 * Tells the User a Plan follows a buddy's, so their edits may be replaced.
 * Long-press to view the buddy.
 */
export default function LinkedPlanBanner({ share }: { share: BuddyShareRef }) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const buddy = useBuddies((state) =>
    state.buddies.find((candidate) => candidate.inboxId === share.from)
  )
  if (!buddy) return null

  return (
    <ContextMenu
      actions={[
        {
          id: 'view_buddy',
          title: i18n.t('buddies_viewBuddy'),
          systemImage: 'person.crop.circle',
          onPress: () =>
            navigation.navigate('Buddy', { inboxId: buddy.inboxId }),
        },
      ]}
    >
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
          avatar={buddy.avatar}
          name={buddyDisplayName(buddy)}
          colorIndex={buddy.colorIndex}
          size={24}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text }}>
            {i18n.t('buddies_sharedBy', { name: buddyDisplayName(buddy) })}
          </Text>
        </View>
      </XView>
    </ContextMenu>
  )
}
