import moment from 'moment'
import type { SharedBadge } from '@/types/badges'
import {
  BADGE_ALERT_INTERVAL_MS,
  type BuddyNotification,
} from '@/features/buddies/lib/state'

export const isBuddyNews = (entry: BuddyNotification) =>
  entry.kind === 'badge' || entry.kind === 'badgeReaction'

export type BuddyNewsItem = {
  entry: BuddyNotification

  ids: string[]
}

function withOlderBadges(
  badges: readonly SharedBadge[],
  older: readonly SharedBadge[]
): SharedBadge[] {
  const merged = [...badges]
  for (const badge of older) {
    const at = merged.findIndex((named) => named.c === badge.c)
    if (at === -1) merged.push(badge)
    else if ((badge.l ?? 0) > (merged[at].l ?? 0)) merged[at] = badge
  }
  return merged
}

export function buddyNews(
  notifications: readonly BuddyNotification[]
): BuddyNewsItem[] {
  const items: BuddyNewsItem[] = []

  const open = new Map<string, BuddyNewsItem>()
  const newestFirst = notifications
    .filter(isBuddyNews)
    .sort((a, b) => b.at - a.at)
  for (const entry of newestFirst) {
    const row = entry.kind === 'badge' && entry.from && open.get(entry.from)
    if (row && row.entry.at - entry.at < BADGE_ALERT_INTERVAL_MS) {
      row.ids.push(entry.id)
      row.entry = {
        ...row.entry,
        read: row.entry.read && entry.read,
        badges: withOlderBadges(row.entry.badges ?? [], entry.badges ?? []),
      }
      continue
    }
    const item = { entry, ids: [entry.id] }
    if (entry.kind === 'badge' && entry.from) open.set(entry.from, item)
    items.push(item)
  }
  return items
}

export type NewsWhen = 'today' | 'thisWeek' | 'earlier'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function newsWhen(at: number, now: number): NewsWhen {
  if (at >= now || moment(at).isSame(now, 'day')) return 'today'
  return now - at < WEEK_MS ? 'thisWeek' : 'earlier'
}
