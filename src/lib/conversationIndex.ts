import { Visit } from '@/types/visit'
import { StalenessBreakpoints } from '@/types/staleness'
import { normalizeStalenessBreakpoints } from '@/constants/staleness'
import { ContactStaleness } from '@/lib/contactStaleness'
import {
  isAppointment,
  isOwnVisit,
  MISSED_FOLLOW_UP_AFTER_HOURS,
  MISSED_FOLLOW_UP_LOOKBACK_DAYS,
} from '@/lib/conversations'

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
  /**
   * Contact ids the User studied with in the current calendar month, as the
   * month's report counts them (`contactStudiedForGivenMonth`): a study that
   * came with a shared Contact is the sender's.
   */
  studiedThisMonthIds: Set<string>
  /**
   * Epoch-ms of the soonest open Follow-up per contact id that isn't missed yet
   * (see `followUpCardItems`). Contacts without one have no entry.
   */
  nextFollowUpMs: Map<string, number>
  /**
   * Epoch-ms of the oldest open Follow-up per contact id that was missed
   * (mirrors `overdueFollowUpConversations` with the Missed Follow-up
   * lookback). Contacts without one have no entry.
   */
  missedFollowUpMs: Map<string, number>
  /**
   * Epoch-ms when the soonest Follow-up in `nextFollowUpMs` turns missed, or
   * null when there's none. A caller that keeps the index across time rebuilds
   * it then (see `useConversationIndex`).
   */
  followUpsChangeAtMs: number | null
  /** The clock (epoch ms) Follow-ups and staleness were judged at. */
  nowMs: number
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
 *
 * `today` (local `YYYY-MM-DD`, from `useLocalDay`) is the day "this month" is
 * measured from. Memoized callers that stay mounted pass it for the same
 * reason, so the index (and its clock-based staleness) rebuilds on a new day.
 * Defaults to the day of `nowMs`.
 *
 * Follow-ups and staleness are judged at `nowMs`. Screens that stay open get
 * the clock from `useConversationIndex`, so the index is rebuilt when a
 * Follow-up turns missed or the day changes.
 */
export function buildConversationIndex(
  conversations: Visit[],
  breakpoints: StalenessBreakpoints,
  today?: string,
  nowMs: number = Date.now()
): ConversationIndex {
  const mostRecentConvMs = new Map<string, number>()
  const mostRecentConvByContact = new Map<string, Visit>()
  const mostRecentStudyMs = new Map<string, number>()
  const studyContactIds = new Set<string>()
  const studiedThisMonthIds = new Set<string>()

  const now = new Date(nowMs)
  const [year, month] = today
    ? today.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1]
  // Current-month bounds as epoch ms, so the "studied this month" check is an
  // integer range test instead of a per-conversation calendar comparison.
  const startOfMonth = new Date(year, month - 1, 1).getTime()
  const startOfNextMonth = new Date(year, month, 1).getTime()

  const appointments: { contactId: string; visitMs: number; dueMs: number }[] =
    []

  for (const c of conversations) {
    const id = c.contact.id
    const ms = new Date(c.date).getTime()
    if (Number.isNaN(ms)) continue

    if (isAppointment(c)) {
      const dueMs = new Date(c.followUp!.date).getTime()
      if (!Number.isNaN(dueMs))
        appointments.push({ contactId: id, visitMs: ms, dueMs })
    }

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
      if (ms >= startOfMonth && ms < startOfNextMonth && isOwnVisit(c)) {
        studiedThisMonthIds.add(id)
      }
    }
  }

  // A Follow-up is answered by a later Visit on its day or after (see
  // `followUpAnswer`). The contact's most recent Visit is the only candidate
  // worth checking: if it doesn't qualify, no earlier one does.
  const HOUR_MS = 60 * 60 * 1000
  const missedBeforeMs = now.getTime() - MISSED_FOLLOW_UP_AFTER_HOURS * HOUR_MS
  const lookbackStart = new Date(now)
  lookbackStart.setHours(0, 0, 0, 0)
  lookbackStart.setDate(
    lookbackStart.getDate() - MISSED_FOLLOW_UP_LOOKBACK_DAYS
  )
  const missedFromMs = lookbackStart.getTime()
  const nextFollowUpMs = new Map<string, number>()
  const missedFollowUpMs = new Map<string, number>()
  let soonestOpenDueMs: number | null = null
  for (const { contactId, visitMs, dueMs } of appointments) {
    const latest = mostRecentConvMs.get(contactId)!
    const dueDay = new Date(dueMs)
    dueDay.setHours(0, 0, 0, 0)
    if (latest > visitMs && latest >= dueDay.getTime()) continue
    if (dueMs > missedBeforeMs) {
      const prev = nextFollowUpMs.get(contactId)
      if (prev === undefined || dueMs < prev)
        nextFollowUpMs.set(contactId, dueMs)
      if (soonestOpenDueMs === null || dueMs < soonestOpenDueMs)
        soonestOpenDueMs = dueMs
    } else if (dueMs >= missedFromMs) {
      const prev = missedFollowUpMs.get(contactId)
      if (prev === undefined || dueMs < prev)
        missedFollowUpMs.set(contactId, dueMs)
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
    nextFollowUpMs,
    missedFollowUpMs,
    followUpsChangeAtMs:
      soonestOpenDueMs === null
        ? null
        : soonestOpenDueMs + MISSED_FOLLOW_UP_AFTER_HOURS * HOUR_MS,
    nowMs,
    stalenessFor,
    stalenessRankFor,
  }
}
