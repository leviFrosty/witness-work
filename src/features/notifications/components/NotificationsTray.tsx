import { useEffect } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { Bell as BellIcon } from 'lucide-react-native'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { NotificationItem } from '@/types/notifications'
import NotificationsList, {
  type TraySyncState,
} from '@/features/notifications/components/NotificationsList'
import { trayEntries, unreadCount } from '@/features/notifications/lib/tray'
import {
  recordArrivals,
  useNotificationsTray,
} from '@/features/notifications/stores/notificationsTray'

const POPOVER_WIDTH = 380

/** Opens the popover when something (a tapped push) asked for it. */
function useOpenOnRequest(open: () => void) {
  const requested = useNotificationsTray((state) => state.openRequested)
  useEffect(() => {
    if (!requested) return
    useNotificationsTray.setState({ openRequested: false })
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
        size='xl'
        hitSlop={12}
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
            top: -5,
            right: -7,
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
 * Home header bell over every feature's time- and event-based notices, with an
 * unread badge. Items are derived by the caller; this owns dismissal, read
 * state, and when each item came in.
 */
export default function NotificationsTray({
  items,
  now,
  onOpen,
  syncState,
  onRetrySync,
}: {
  items: NotificationItem[]
  now: number
  onOpen?: () => void
  /** A remote source (Buddies) being checked, or failing to be. */
  syncState?: TraySyncState
  onRetrySync?: () => void
}) {
  const { width } = useWindowDimensions()
  const arrivals = useNotificationsTray((state) => state.arrivals)
  const dismissed = useNotificationsTray((state) => state.dismissed)
  const seen = useNotificationsTray((state) => state.seen)
  const entries = trayEntries(items, { arrivals, dismissed, seen }, now)

  const ids = items.map((item) => item.id).join('\n')
  useEffect(() => {
    if (ids) recordArrivals(ids.split('\n'))
  }, [ids])

  return (
    <AnchoredPopover
      contentWidth={Math.min(POPOVER_WIDTH, width - 24)}
      contentStyle={{ padding: 0 }}
      renderTrigger={({ onPress, anchorRef }) => (
        <BellTrigger
          onPress={onPress}
          anchorRef={anchorRef}
          unread={unreadCount(entries)}
        />
      )}
    >
      {({ closeThen }) => (
        <NotificationsList
          entries={entries}
          closeThen={closeThen}
          onOpen={onOpen}
          syncState={syncState}
          onRetrySync={onRetrySync}
        />
      )}
    </AnchoredPopover>
  )
}
