import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MmkvStorage } from '@/stores/mmkv'
import {
  pruned,
  stamped,
  type TrayBook,
} from '@/features/notifications/lib/tray'

type NotificationsTrayState = TrayBook & {
  /** Set by a tapped push; the Home bell opens once it's on screen. */
  openRequested: boolean
}

/**
 * Tray bookkeeping (MMKV). Per-device and outside iCloud Sync, like the Buddies
 * queue: the items themselves come from each feature's own state.
 */
export const useNotificationsTray = create<NotificationsTrayState>()(
  persist(
    (): NotificationsTrayState => ({
      arrivals: {},
      dismissed: {},
      seen: {},
      openRequested: false,
    }),
    {
      name: 'notificationsTray',
      version: 1,
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

/** Asks the Home bell to open, e.g. after tapping a push. */
export function requestNotificationsTray() {
  useNotificationsTray.setState({ openRequested: true })
}
