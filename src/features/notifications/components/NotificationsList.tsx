import { useEffect, useRef } from 'react'
import { ScrollView, useWindowDimensions, View } from 'react-native'
import { Bell as BellIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { NotificationAction } from '@/types/notifications'
import NotificationRow from '@/features/notifications/components/NotificationRow'
import {
  clearableIds,
  unreadCount,
  type TrayEntry,
} from '@/features/notifications/lib/tray'
import {
  dismissNotifications,
  markSeen,
} from '@/features/notifications/stores/notificationsTray'

/**
 * The bell's popover, newest first. Everything listed is marked read when it
 * closes.
 */
export default function NotificationsList({
  entries,
  closeThen,
  onOpen,
}: {
  entries: TrayEntry[]
  /** Closes the popover, then runs the action (e.g. navigating). */
  closeThen: (action: () => void) => void
  onOpen?: () => void
}) {
  const theme = useTheme()
  const { height } = useWindowDimensions()
  const listed = useRef(entries)
  const opened = useRef(onOpen)
  useEffect(() => {
    listed.current = entries
  })

  // Runs once per opening, with what was listed as it opened.
  useEffect(() => {
    const initial = listed.current
    analytics.capture('notifications_tray_opened', {
      item_count: initial.length,
      unread_count: unreadCount(initial),
    })
    for (const { item } of initial) item.onView?.()
    opened.current?.()
    return () => markSeen(listed.current.map(({ item }) => item.id))
  }, [])

  const dismiss = ({ item }: TrayEntry) => {
    analytics.capture('notification_dismissed', { kind: item.kind })
    dismissNotifications([item.id])
    item.onDismiss?.()
  }

  const act = ({ item }: TrayEntry, action: NotificationAction) => {
    analytics.capture('notification_action_tapped', {
      kind: item.kind,
      action: action.id,
    })
    if (action.inPlace) action.onPress()
    else closeThen(action.onPress)
  }

  const clearAll = () => {
    const ids = new Set(clearableIds(entries))
    const cleared = entries.filter(({ item }) => ids.has(item.id))
    analytics.capture('notifications_cleared', { count: cleared.length })
    dismissNotifications([...ids])
    for (const { item } of cleared) item.onDismiss?.()
  }

  if (entries.length === 0) {
    return (
      <Empty
        icon={
          <LucideIcon icon={BellIcon} size={24} color={theme.colors.text} />
        }
        title={i18n.t('notifications_emptyTitle')}
        description={i18n.t('notifications_emptyBody')}
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
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('notifications_title')}
        </Text>
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
      <ScrollView style={{ maxHeight: height * 0.6 }}>
        {entries.map((entry, index) => {
          const last = index === entries.length - 1
          const { item } = entry
          if (item.render)
            return (
              <View
                key={item.id}
                style={{
                  borderBottomWidth: last ? 0 : 1,
                  borderColor: theme.colors.border,
                }}
              >
                {item.render({
                  unread: entry.unread,
                  dismiss: () => dismiss(entry),
                  closeThen,
                })}
              </View>
            )
          return (
            <NotificationRow
              key={item.id}
              item={item}
              at={entry.at}
              unread={entry.unread}
              last={last}
              onAction={(action) => act(entry, action)}
              onDismiss={() => dismiss(entry)}
            />
          )
        })}
      </ScrollView>
    </View>
  )
}
