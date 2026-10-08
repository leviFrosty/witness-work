import { useEffect, useRef } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  View,
  type LayoutRectangle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { Bell as BellIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

import i18n from '@/lib/locales'
import type { NotificationAction } from '@/types/notifications'
import NotificationRow from '@/features/notifications/components/NotificationRow'
import TraySyncFailed from '@/features/notifications/components/TraySyncFailed'
import {
  clearableIds,
  trayGroups,
  visibleIds,
  type RowLayout,
  type TrayEntry,
} from '@/features/notifications/lib/tray'
import {
  dismissNotifications,
  markSeen,
  useNotificationsTray,
} from '@/features/notifications/stores/notificationsTray'

/** Whether the tray's remote sources (Buddies) are being checked. */
export type TraySyncState = 'idle' | 'syncing' | 'failed'

/**
 * The bell's popover, newest first, with buddies' news grouped at the bottom
 * under "From your buddies". An item counts as read once it's been on screen:
 * it gets its `onView` then, and is marked read when the tray closes.
 */
export default function NotificationsList({
  entries,
  closeThen,
  onOpen,
  syncState = 'idle',
  onRetrySync,
}: {
  entries: TrayEntry[]
  /** Closes the popover, then runs the action (e.g. navigating). */
  closeThen: (action: () => void) => void
  onOpen?: () => void
  syncState?: TraySyncState
  onRetrySync?: () => void
}) {
  const theme = useTheme()
  const { height } = useWindowDimensions()
  const opened = useRef(onOpen)
  /** Row positions in the scroll content, by item id. */
  const layouts = useRef<Record<string, RowLayout>>({})
  const viewport = useRef({ offset: 0, height: 0 })
  /** Shown on screen during this opening. */
  const viewed = useRef(new Set<string>())

  // Runs once per opening, with what was listed as it opened.
  useEffect(() => {
    const shown = viewed.current

    opened.current?.()
    useNotificationsTray.setState({ open: true })
    return () => {
      useNotificationsTray.setState({ open: false })
      markSeen([...shown])
    }
  }, [])

  /** Marks rows that just came on screen as viewed. */
  const reveal = () => {
    for (const id of visibleIds(layouts.current, viewport.current)) {
      if (viewed.current.has(id)) continue
      const entry = entries.find(({ item }) => item.id === id)
      if (!entry) continue
      viewed.current.add(id)
      entry.item.onView?.()
    }
  }

  const scrolled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    viewport.current.offset = event.nativeEvent.contentOffset.y
    reveal()
  }

  const measureRow = (
    id: string,
    { y, height: rowHeight }: LayoutRectangle
  ) => {
    layouts.current[id] = { y, height: rowHeight }
    reveal()
  }

  // Rows that left the tray no longer count toward what's on screen.
  const ids = entries.map(({ item }) => item.id).join('\n')
  useEffect(() => {
    const current = new Set(ids.split('\n'))
    for (const id of Object.keys(layouts.current))
      if (!current.has(id)) delete layouts.current[id]
  }, [ids])

  const dismiss = ({ item }: TrayEntry) => {
    dismissNotifications([item.id])
    item.onDismiss?.()
  }

  const act = (entry: TrayEntry, action: NotificationAction) => {
    if (action.inPlace) action.onPress()
    else closeThen(action.onPress)
  }

  const clearAll = () => {
    const ids = new Set(clearableIds(entries))
    const cleared = entries.filter(({ item }) => ids.has(item.id))

    dismissNotifications([...ids])
    for (const { item } of cleared) item.onDismiss?.()
  }

  const { main, news } = trayGroups(entries)
  // Rows stay direct children of the scroll content, so their layout `y` is
  // their place in it.
  const renderEntry = (entry: TrayEntry, last: boolean) => {
    const { item } = entry
    return (
      <View
        key={item.id}
        onLayout={(event) => measureRow(item.id, event.nativeEvent.layout)}
        style={
          item.render
            ? {
                borderBottomWidth: last ? 0 : 1,
                borderColor: theme.colors.border,
              }
            : undefined
        }
      >
        {item.render ? (
          item.render({
            unread: entry.unread,
            dismiss: () => dismiss(entry),
            closeThen,
          })
        ) : (
          <NotificationRow
            item={item}
            at={entry.at}
            unread={entry.unread}
            last={last}
            onAction={(action) => act(entry, action)}
            onDismiss={() => dismiss(entry)}
          />
        )}
      </View>
    )
  }

  const failed =
    syncState === 'failed' && onRetrySync ? (
      <TraySyncFailed onRetry={onRetrySync} />
    ) : null
  const spinner =
    syncState === 'syncing' ? (
      <ActivityIndicator
        size='small'
        color={theme.colors.textAlt}
        accessibilityLabel={i18n.t('notifications_checking')}
      />
    ) : null

  if (entries.length === 0) {
    if (failed) return failed
    return (
      <Empty
        icon={
          <LucideIcon icon={BellIcon} size={24} color={theme.colors.text} />
        }
        title={i18n.t('notifications_emptyTitle')}
        description={i18n.t('notifications_emptyBody')}
        action={spinner ?? undefined}
      />
    )
  }

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('notifications_title')}
          </Text>
          {spinner}
        </View>
        {clearableIds(entries).length > 0 && (
          <Button noTransform onPress={clearAll}>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('notifications_clearAll')}
            </Text>
          </Button>
        )}
      </View>
      {failed}
      <ScrollView
        style={{ maxHeight: height * 0.6 }}
        scrollEventThrottle={100}
        onLayout={(event) => {
          viewport.current.height = event.nativeEvent.layout.height
          reveal()
        }}
        onScroll={scrolled}
        // A fling's last scroll event can be throttled away (Android), so the
        // resting place counts too: buddies' news sits at the bottom.
        onScrollEndDrag={scrolled}
        onMomentumScrollEnd={scrolled}
      >
        {main.map((entry, index) =>
          renderEntry(entry, index === main.length - 1)
        )}
        {news.length > 0 ? (
          <View
            style={{
              paddingTop: 12,
              paddingBottom: 2,
              paddingHorizontal: 14,
              borderTopWidth: main.length > 0 ? 1 : 0,
              borderColor: theme.colors.border,
            }}
          >
            <Text
              accessibilityRole='header'
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('notifications_fromBuddies')}
            </Text>
          </View>
        ) : null}
        {news.map((entry, index) =>
          renderEntry(entry, index === news.length - 1)
        )}
      </ScrollView>
    </View>
  )
}
