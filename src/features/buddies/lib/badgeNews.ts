import moment from 'moment'
import type { SharedBadge } from '@/types/badges'
import {
  BADGE_ALERT_INTERVAL_MS,
  type BuddyNotification,
} from '@/features/buddies/lib/state'

/**
 * Buddies' news in the bell (ADR 0021): a buddy's new badges, and a buddy's
 * reaction to one of this User's badges. Social, so it never counts.
 */
export const isBuddyNews = (entry: BuddyNotification) =>
  entry.kind === 'badge' || entry.kind === 'badgeReaction'

/** One bell row of buddies' news. */
export type BuddyNewsItem = {
  /**
   * The entry the row shows and goes by: the newest of `ids`. A buddy's badge
   * news carries every badge of the row, the one to name first leading.
   */
  entry: BuddyNotification
  /** The queue entries the row stands for, newest first. */
  ids: string[]
}

/**
 * A row's badges with older news folded in after them: each collection once, at
 * the highest level named, where it was first named.
 */
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

/**
 * Buddies' news as bell rows, newest first. A buddy's badge news within 20
 * hours of their newest shares one row ("Tomás has 2 new badges"), the same
 * window as their badge alerts; reactions are already one per buddy and badge.
 * Read only once every entry in the row is.
 */
export function buddyNews(
  notifications: readonly BuddyNotification[]
): BuddyNewsItem[] {
  const items: BuddyNewsItem[] = []
  /** Each buddy's newest badge row, still taking older news. */
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

/** How long ago news came in, no finer than this (ADR 0021). */
export type NewsWhen = 'today' | 'thisWeek' | 'earlier'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Today, This week (the last 7 days), or Earlier. Never a time of day: a
 * buddy's news at 9 pm says when they were out.
 */
export function newsWhen(at: number, now: number): NewsWhen {
  if (at >= now || moment(at).isSame(now, 'day')) return 'today'
  return now - at < WEEK_MS ? 'thisWeek' : 'earlier'
}
