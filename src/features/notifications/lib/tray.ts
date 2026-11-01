import type { NotificationItem } from '@/types/notifications'

export type TrayBook = {
  arrivals: Record<string, number>
  dismissed: Record<string, number>
  seen: Record<string, number>
}

export type TrayEntry = {
  item: NotificationItem
  at: number
  unread: boolean
}

export const TRAY_BOOK_RETENTION_MS = 365 * 24 * 60 * 60 * 1000

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

export const unreadCount = (entries: TrayEntry[]) =>
  entries.filter((entry) => entry.unread && !entry.item.social).length

export const hasUnreadNews = (entries: TrayEntry[]) =>
  entries.some((entry) => entry.unread && entry.item.social)

export function trayGroups(entries: TrayEntry[]): {
  main: TrayEntry[]
  news: TrayEntry[]
} {
  return {
    main: entries.filter((entry) => !entry.item.social),
    news: entries.filter((entry) => entry.item.social),
  }
}

export const clearableIds = (entries: TrayEntry[]) =>
  entries.filter((entry) => !entry.item.sticky).map((entry) => entry.item.id)

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

export type RowLayout = { y: number; height: number }

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
