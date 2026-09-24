import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Bell as BellIcon } from 'lucide-react-native'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Home header bell for the buddy notification queue, with an unread badge. Only
 * shown once the User has started using Buddies.
 */
export default function BuddyNotificationsBell() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const unread = useBuddies(
    (state) => state.notifications.filter((n) => !n.read).length
  )
  if (!enabled || !started) return null

  return (
    <View style={{ position: 'relative' }}>
      <IconButton
        icon={BellIcon}
        color={theme.colors.text}
        accessibilityLabel={
          unread > 0
            ? `${i18n.t('buddies_notificationsA11y')}. ${i18n.t('buddies_unreadCount', { count: unread })}.`
            : i18n.t('buddies_notificationsA11y')
        }
        onPress={() => navigation.navigate('BuddyNotifications')}
      />
      {unread > 0 && (
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            top: -6,
            right: -8,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.error,
          }}
        >
          <Text
            style={{
              color: theme.colors.textInverse,
              fontSize: 10,
              fontFamily: theme.fonts.bold,
            }}
          >
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      )}
    </View>
  )
}
