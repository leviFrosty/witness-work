import { useEffect } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { Bell as BellIcon } from 'lucide-react-native'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import BuddyNotificationsList from '@/features/buddies/components/BuddyNotificationsList'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useNotificationsPopover } from '@/features/buddies/stores/notificationsPopover'

const POPOVER_WIDTH = 380

/** Opens the popover when something (a tapped push) asked for it. */
function useOpenOnRequest(open: () => void) {
  const requested = useNotificationsPopover((state) => state.openRequested)
  useEffect(() => {
    if (!requested) return
    useNotificationsPopover.setState({ openRequested: false })
    open()
  }, [requested, open])
}

function BellTrigger({
  onPress,
  anchorRef,
  unread,
}: {
  onPress: () => void
  anchorRef: React.RefObject<View | null>
  unread: number
}) {
  const theme = useTheme()
  useOpenOnRequest(onPress)

  return (
    <View ref={anchorRef} collapsable={false} style={{ position: 'relative' }}>
      <IconButton
        icon={BellIcon}
        color={theme.colors.text}
        accessibilityLabel={
          unread > 0
            ? `${i18n.t('notifications_a11y')}. ${i18n.t('notifications_unreadCount', { count: unread })}.`
            : i18n.t('notifications_a11y')
        }
        onPress={onPress}
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

/**
 * Home header bell for the buddy notification queue, with an unread badge. The
 * queue opens in a popover. Only shown once the User has started using
 * Buddies.
 */
export default function BuddyNotificationsBell() {
  const { width } = useWindowDimensions()
  const enabled = useBuddiesEnabled()
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const unread = useBuddies(
    (state) => state.notifications.filter((n) => !n.read).length
  )
  if (!enabled || !started) return null

  return (
    <AnchoredPopover
      contentWidth={Math.min(POPOVER_WIDTH, width - 24)}
      contentStyle={{ padding: 0 }}
      renderTrigger={({ onPress, anchorRef }) => (
        <BellTrigger onPress={onPress} anchorRef={anchorRef} unread={unread} />
      )}
    >
      {({ closeThen }) => <BuddyNotificationsList closeThen={closeThen} />}
    </AnchoredPopover>
  )
}
