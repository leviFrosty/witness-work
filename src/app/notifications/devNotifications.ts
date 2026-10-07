import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { FlaskConical as FlaskConicalIcon } from 'lucide-react-native'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MmkvStorage } from '@/stores/mmkv'
import type { NotificationItem } from '@/types/notifications'
import { navigationRef } from '@/features/contacts/lib/linking'
import {
  requestNotificationsTray,
  useNotificationsTray,
} from '@/features/notifications/stores/notificationsTray'

/** Marks a Tools push whose tap opens the tray. */
export const DEV_TRAY_PUSH_DATA = { devTray: true }

type DevNotification = {
  id: string
  title: string
  description?: string
  /** Listed from this time on, so a scheduled push's item lands as it fires. */
  at: number
  sticky?: boolean
}

type DevNotificationsState = { items: DevNotification[] }

/** Test items for the notifications tray, added from the Tools screen. */
export const useDevNotifications = create<DevNotificationsState>()(
  persist((): DevNotificationsState => ({ items: [] }), {
    name: 'devNotifications',
    version: 1,
    storage: createJSONStorage(() => MmkvStorage),
  })
)

let sequence = 0

export function addDevNotification(
  item: Omit<DevNotification, 'id' | 'at'> & { at?: number }
) {
  sequence += 1
  const next = { at: Date.now(), ...item, id: `dev:${Date.now()}:${sequence}` }
  useDevNotifications.setState(({ items }) => ({ items: [...items, next] }))
  return next
}

function bumpDevNotification(id: string) {
  useDevNotifications.setState(({ items }) => ({
    items: items.map((item) =>
      item.id === id ? { ...item, at: Date.now() } : item
    ),
  }))
}

/** Drops every test item and its tray bookkeeping. */
export function clearDevNotifications() {
  const withoutDev = (record: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(record).filter(([id]) => !id.startsWith('dev:'))
    )
  useDevNotifications.setState({ items: [] })
  useNotificationsTray.setState(({ arrivals, dismissed, seen }) => ({
    arrivals: withoutDev(arrivals),
    dismissed: withoutDev(dismissed),
    seen: withoutDev(seen),
  }))
}

/** Switches to Home and opens the bell, like a tapped Buddies push. */
export function openNotificationsTray() {
  if (navigationRef.isReady())
    navigationRef.navigate('Root', { screen: 'Home' } as never, { pop: true })
  requestNotificationsTray()
}

/**
 * Tray items for the Tools screen's tests. Tapping one of its pushes opens the
 * tray.
 */
export default function useDevNotificationItems(
  now: number
): NotificationItem[] {
  const items = useDevNotifications((state) => state.items)

  useEffect(() => {
    const tapped = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (response.notification.request.content.data?.devTray)
          openNotificationsTray()
      }
    )
    return () => tapped.remove()
  }, [])

  return items
    .filter((item) => item.at <= now)
    .map((item) => ({
      ...item,
      kind: 'dev_test',
      icon: FlaskConicalIcon,
      actions: [
        {
          id: 'open_tools',
          label: 'Open Tools',
          onPress: () =>
            navigationRef.navigate('Root', { screen: 'Tools' } as never, {
              pop: true,
            }),
        },
        {
          id: 'bump',
          label: 'Bump',
          inPlace: true,
          onPress: () => bumpDevNotification(item.id),
        },
      ],
    }))
}
