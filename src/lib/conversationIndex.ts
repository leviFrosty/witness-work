import { Visit } from '@/types/visit'
import { StalenessBreakpoints } from '@/types/staleness'
import { normalizeStalenessBreakpoints } from '@/constants/staleness'
import { ContactStaleness } from '@/lib/contactStaleness'

/**
 * Numeric ranking of staleness buckets, most-recent (0) to most-lapsed (3).
 * Lives here (not in the sort lib) so any consumer reading the index can rank
 * without pulling in the comparator.
 */
export const stalenessRank: Record<ContactStaleness, number> = {
  never: 0,
  recent: 1,
  week: 2,
  month: 3,
}

/**
 * Per-contact conversation aggregates, computed in a single O(conversations)
 * pass. Every list-screen consumer (the stats header's staleness tally, each
 * ContactRow's stripe/study/most-recent, and the sort comparator) reads from
 * this in O(1) instead of re-scanning the full conversations array per contact
 * — the pattern that made first paint ~1.5s on a 2.5k-conversation account.
 *
 * Dates are parsed with native `new Date(...).getTime()` (epoch ms), not
 * `moment`, because the pass runs once over every conversation and `moment`
 * allocation dominated even the single-pass cost. Magnitudes are only ever
 * compared, so ms vs. unix-seconds is immaterial.
 */
export type ConversationIndex = {
  /** Epoch-ms of the most recent conversation per contact id. */
  mostRecentConvMs: Map<string, number>
  /** The most recent conversation record per contact id (for display). */
  mostRecentConvByContact: Map<string, Visit>
  /** Epoch-ms of the most recent Bible-study conversation per contact id. */
  mostRecentStudyMs: Map<string, number>
  /** Contact ids that have at least one Bible-study conversation, ever. */
  studyContactIds: Set<string>
  /** Contact ids with a Bible-study conversation in the current calendar month. */
  studiedThisMonthIds: Set<string>
  /** Staleness bucket for a contact id (mirrors `getContactStaleness`). */
  stalenessFor: (contactId: string) => ContactStaleness
  /** Numeric staleness rank for a contact id (for the comparator). */
  stalenessRankFor: (contactId: string) => number
}

/**
 * `breakpoints` (the user's `stalenessBreakpoints` preference) is required so
 * memoized callers are forced to thread it through — and therefore to include
 * it in their dependency arrays, which is what invalidates the index when the
 * user edits the thresholds in settings.
 */
export function buildConversationIndex(
  conversations: Visit[],
  breakpoints: StalenessBreakpoints
): ConversationIndex {
  const mostRecentConvMs = new Map<string, number>()
  const mostRecentConvByContact = new Map<string, Visit>()
  const mostRecentStudyMs = new Map<string, number>()
  const studyContactIds = new Set<string>()
  const studiedThisMonthIds = new Set<string>()

  const now = new Date()
  // Current-month bounds as epoch ms, so the "studied this month" check is an
  // integer range test instead of a per-conversation calendar comparison.
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const startOfNextMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1
  ).getTime()

  for (const c of conversations) {
    const id = c.contact.id
    const ms = new Date(c.date).getTime()
    if (Number.isNaN(ms)) continue

    const prevConv = mostRecentConvMs.get(id)
    if (prevConv === undefined || ms > prevConv) {
      mostRecentConvMs.set(id, ms)
      mostRecentConvByContact.set(id, c)
    }

    if (c.isBibleStudy) {
      studyContactIds.add(id)
      const prevStudy = mostRecentStudyMs.get(id)
      if (prevStudy === undefined || ms > prevStudy) {
        mostRecentStudyMs.set(id, ms)
      }
      if (ms >= startOfMonth && ms < startOfNextMonth) {
        studiedThisMonthIds.add(id)
      }
    }
  }

  // Staleness thresholds as plain epoch ms. Mirrors getContactStaleness:
  // before(now − monthDays) → month, before(now − weekDays) → week, else
  // recent.
  const { weekDays, monthDays } = normalizeStalenessBreakpoints(breakpoints)
  const DAY_MS = 24 * 60 * 60 * 1000
  const monthAgoMs = now.getTime() - monthDays * DAY_MS
  const weekAgoMs = now.getTime() - weekDays * DAY_MS

  const stalenessFor = (contactId: string): ContactStaleness => {
    const ms = mostRecentConvMs.get(contactId)
    if (ms === undefined) return 'never'
    if (ms < monthAgoMs) return 'month'
    if (ms < weekAgoMs) return 'week'
    return 'recent'
  }

  const stalenessRankFor = (contactId: string): number =>
    stalenessRank[stalenessFor(contactId)]

  return {
    mostRecentConvMs,
    mostRecentConvByContact,
    mostRecentStudyMs,
    studyContactIds,
    studiedThisMonthIds,
    stalenessFor,
    stalenessRankFor,
  }
}
