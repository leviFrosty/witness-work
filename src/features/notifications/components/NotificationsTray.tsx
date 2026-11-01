import { useEffect, useRef, useState } from 'react'
import { AppState, useWindowDimensions, View } from 'react-native'
import { Bell as BellIcon } from 'lucide-react-native'
import Popover from '@/components/ui/Popover'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import { useIsTakingOver } from '@/hooks/useTakeoverTurn'
import i18n from '@/lib/locales'
import { hiddenFromScreenReaders } from '@/lib/screenReader'
import type { NotificationItem } from '@/types/notifications'
import NotificationsList, {
  type TraySyncState,
} from '@/features/notifications/components/NotificationsList'
import { setAppIconBadge } from '@/features/notifications/lib/appIconBadge'
import {
  hasUnreadNews,
  trayEntries,
  unreadCount,
} from '@/features/notifications/lib/tray'
import {
  recordArrivals,
  setUnreadCount,
  useNotificationsTray,
} from '@/features/notifications/stores/notificationsTray'

const POPOVER_WIDTH = 380

const TRIGGER_PADDING = 8

function useOpenOnRequest(open: () => void, laidOut: boolean) {
  const requested = useNotificationsTray((state) => state.openRequested)
  const takingOver = useIsTakingOver()
  const latestOpen = useRef(open)
  useEffect(() => {
    latestOpen.current = open
  })
  useEffect(() => {
    if (!requested || takingOver || !laidOut) return
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        useNotificationsTray.setState({ openRequested: false })
        latestOpen.current()
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [requested, takingOver, laidOut])
}

function useAppIconBadge(unread: number) {
  useEffect(() => {
    setUnreadCount(unread)
  }, [unread])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const { unread } = useNotificationsTray.getState()
      if (state === 'background' && unread !== null) setAppIconBadge(unread)
    })
    return () => subscription.remove()
  }, [])
}

function BellTrigger({
  onPress,
  unread,
  news,
}: {
  onPress: () => void
  unread: number

  news: boolean
}) {
  const theme = useTheme()
  const [laidOut, setLaidOut] = useState(false)
  useOpenOnRequest(onPress, laidOut)

  return (
    <View
      style={{ padding: TRIGGER_PADDING }}
      onLayout={() => setLaidOut(true)}
    >
      <PointerTooltip label={i18n.t('notifications_a11y')} effect='none'>
        <IconButton
          icon={BellIcon}
          size='xl'
          hitSlop={12}
          color={theme.colors.text}
          testID='notifications-bell'
          accessibilityLabel={
            unread > 0
              ? i18n.t('notifications_a11yUnread', { count: unread })
              : news
                ? i18n.t('notifications_a11yNews')
                : i18n.t('notifications_a11y')
          }
          onPress={onPress}
        />
      </PointerTooltip>
      {unread > 0 && (
        <View
          pointerEvents='none'
          {...hiddenFromScreenReaders}
          style={{
            position: 'absolute',
            top: TRIGGER_PADDING - 5,
            right: TRIGGER_PADDING - 7,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.error,
          }}
        >
          {}
          <Text
            maxFontSizeMultiplier={1.2}
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
      {unread === 0 && news && (
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            top: TRIGGER_PADDING - 1,
            right: TRIGGER_PADDING - 1,
            width: 10,
            height: 10,
            borderRadius: 5,
            borderWidth: 1.5,
            borderColor: theme.colors.background,
            backgroundColor: theme.colors.accent,
          }}
        />
      )}
    </View>
  )
}

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

  syncState?: TraySyncState
  onRetrySync?: () => void
}) {
  const { width } = useWindowDimensions()
  const arrivals = useNotificationsTray((state) => state.arrivals)
  const dismissed = useNotificationsTray((state) => state.dismissed)
  const seen = useNotificationsTray((state) => state.seen)
  const entries = trayEntries(items, { arrivals, dismissed, seen }, now)
  const unread = unreadCount(entries)
  const news = hasUnreadNews(entries)
  useAppIconBadge(unread)

  const ids = items.map((item) => item.id).join('\n')
  useEffect(() => {
    if (ids) recordArrivals(ids.split('\n'))
  }, [ids])

  return (
    <Popover
      contentWidth={Math.min(POPOVER_WIDTH, width - 24)}
      contentStyle={{ paddingHorizontal: 8, paddingVertical: 12 }}
      style={{ margin: -TRIGGER_PADDING }}
      renderTrigger={({ onPress }) => (
        <BellTrigger onPress={onPress} unread={unread} news={news} />
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
    </Popover>
  )
}
