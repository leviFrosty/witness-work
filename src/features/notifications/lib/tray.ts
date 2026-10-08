import type { NotificationItem } from '@/types/notifications'

/** Per-device bookkeeping, keyed by item id, in epoch ms. */
export type TrayBook = {
  /** First time the tray listed the item; its timestamp when it has none. */
  arrivals: Record<string, number>
  dismissed: Record<string, number>
  seen: Record<string, number>
}

export type TrayEntry = {
  item: NotificationItem
  at: number
  unread: boolean
}

/**
 * Long enough to outlive every occurrence id (a Follow-up is listed for 30
 * days, a report for a month), so a dismissed item never comes back.
 */
export const TRAY_BOOK_RETENTION_MS = 365 * 24 * 60 * 60 * 1000

/** What the tray lists: undismissed items, newest first. */
export function trayEntries(
  items: NotificationItem[],
  book: TrayBook,
  now: number
): TrayEntry[] {
  return items
    .filter((item) => book.dismissed[item.id] === undefined)
    .map((item) => ({
      item,
      at: item.at ?? book.arrivals[item.id] ?? now,
      unread: book.seen[item.id] === undefined,
    }))
    .sort((a, b) => b.at - a.at)
}

/**
 * The bell's number and the app icon badge: unread items, leaving out buddies'
 * news, which never calls for attention.
 */
export const unreadCount = (entries: TrayEntry[]) =>
  entries.filter((entry) => entry.unread && !entry.item.social).length

/** Buddies' news the User hasn't seen yet, for the bell's quiet dot. */
export const hasUnreadNews = (entries: TrayEntry[]) =>
  entries.some((entry) => entry.unread && entry.item.social)

/**
 * The tray's two groups, each newest first: everything else on top, then
 * buddies' news under "From your buddies".
 */
export function trayGroups(entries: TrayEntry[]): {
  main: TrayEntry[]
  news: TrayEntry[]
} {
  return {
    main: entries.filter((entry) => !entry.item.social),
    news: entries.filter((entry) => entry.item.social),
  }
}

/** "Clear All" leaves sticky items, like invitations still to answer. */
export const clearableIds = (entries: TrayEntry[]) =>
  entries.filter((entry) => !entry.item.sticky).map((entry) => entry.item.id)

/** Stamps `ids` that aren't in `record` yet; same object when nothing's new. */
export function stamped(
  record: Record<string, number>,
  ids: string[],
  now: number
): Record<string, number> {
  const fresh = ids.filter((id) => record[id] === undefined)
  if (fresh.length === 0) return record
  return { ...record, ...Object.fromEntries(fresh.map((id) => [id, now])) }
}

export function pruned(
  record: Record<string, number>,
  now: number
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).filter(([, at]) => now - at < TRAY_BOOK_RETENTION_MS)
  )
}

/** Where a row sits in the tray's scroll content. */
export type RowLayout = { y: number; height: number }

/**
 * Rows shown on screen: at least half visible, or filling half the viewport
 * when taller than it. This is what "read" means for the tray.
 */
export function visibleIds(
  layouts: Record<string, RowLayout>,
  viewport: { offset: number; height: number }
): string[] {
  if (viewport.height <= 0) return []
  const top = viewport.offset
  const bottom = top + viewport.height
  return Object.entries(layouts)
    .filter(([, { y, height }]) => {
      if (height <= 0) return false
      const shown = Math.min(bottom, y + height) - Math.max(top, y)
      return shown >= Math.min(height, viewport.height) / 2
    })
    .map(([id]) => id)
}
