import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import { setAppIconBadge } from '@/features/notifications/lib/appIconBadge'
import {
  pruned,
  stamped,
  type TrayBook,
} from '@/features/notifications/lib/tray'

type NotificationsTrayState = TrayBook & {
  openRequested: boolean

  open: boolean

  unread: number | null
}

export const useNotificationsTray = create<NotificationsTrayState>()(
  persist(
    (): NotificationsTrayState => ({
      arrivals: {},
      dismissed: {},
      seen: {},
      openRequested: false,
      open: false,
      unread: null,
    }),
    {
      name: 'notificationsTray',
      version: 1,
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ arrivals, dismissed, seen }) => ({
        arrivals,
        dismissed,
        seen,
      }),
      merge: (persisted, current) => {
        const book = { ...current, ...(persisted as Partial<TrayBook>) }
        const now = Date.now()
        return {
          ...book,
          arrivals: pruned(book.arrivals, now),
          dismissed: pruned(book.dismissed, now),
          seen: pruned(book.seen, now),
        }
      },
    }
  )
)

export function recordArrivals(ids: string[], now = Date.now()) {
  const { arrivals } = useNotificationsTray.getState()
  const next = stamped(arrivals, ids, now)
  if (next !== arrivals) useNotificationsTray.setState({ arrivals: next })
}

export function markSeen(ids: string[], now = Date.now()) {
  const { seen } = useNotificationsTray.getState()
  const next = stamped(seen, ids, now)
  if (next !== seen) useNotificationsTray.setState({ seen: next })
}

export function dismissNotifications(ids: string[], now = Date.now()) {
  const { dismissed } = useNotificationsTray.getState()
  const next = stamped(dismissed, ids, now)
  if (next !== dismissed) useNotificationsTray.setState({ dismissed: next })
}

export function setUnreadCount(unread: number) {
  if (useNotificationsTray.getState().unread === unread) return
  useNotificationsTray.setState({ unread })
  setAppIconBadge(unread)
}

export function requestNotificationsTray() {
  useNotificationsTray.setState({ openRequested: true })
}
