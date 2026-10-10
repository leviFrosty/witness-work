import moment from 'moment'
import { followUpAnswer } from '@/lib/conversations'
import {
  formatDate,
  formatTime,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'
import { offsetFromMinutes } from '@/lib/notificationOffset'
import type { Visit } from '@/types/visit'

/**
 * Where a Visit's Follow-up stands: still ahead, past with no visit since
 * (overdue), answered by a later visit (the rule Home's card uses), or
 * dismissed.
 */
export type FollowUpStatus = 'upcoming' | 'overdue' | 'kept' | 'dismissed'

export function followUpStatus(
  visit: Visit,
  contactVisits: Visit[],
  now: number
): FollowUpStatus | null {
  const followUp = visit.followUp
  if (!followUp) return null
  if (followUp.dismissed) return 'dismissed'
  if (followUpAnswer(visit, contactVisits)) return 'kept'
  return new Date(followUp.date).getTime() > now ? 'upcoming' : 'overdue'
}

/** The contact's first Visit after this one, if any. */
export function nextVisit(
  visit: Visit,
  contactVisits: Visit[]
): Visit | undefined {
  const after = new Date(visit.date).getTime()
  let next: Visit | undefined
  for (const other of contactVisits) {
    const at = new Date(other.date).getTime()
    if (other.id === visit.id || at <= after) continue
    if (!next || at < new Date(next.date).getTime()) next = other
  }
  return next
}

/** "Thu, Oct 1 · 10:00 AM", with the year when it isn't this year's. */
export function detailsDateTime(date: Date): string {
  const day = moment(date)
  const dayLabel = day.isSame(moment(), 'year')
    ? formatWeekdayMonthDayCompact(day)
    : formatDate(day, { style: 'medium' })
  return `${dayLabel} · ${formatTime(date)}`
}

/** What happened at the Visit, as the past stop's sentence. */
export const pastSentenceKey = (visit: Visit) =>
  visit.notAtHome
    ? 'visitDetails_pastNotAtHome'
    : visit.isBibleStudy
      ? 'visitDetails_pastStudy'
      : 'visitDetails_pastConversation'

const REMIND_KEYS = {
  minutes: 'visitDetails_remindMinutes',
  hours: 'visitDetails_remindHours',
  days: 'visitDetails_remindDays',
  weeks: 'visitDetails_remindWeeks',
} as const

/**
 * When the Follow-up's reminder fires, as a sentence: "We'll remind you 30
 * minutes before.", "...when it's time.", or "No reminder". `minutes` is how
 * far ahead of the Follow-up it fires.
 */
export function reminderSentence(
  followUp: NonNullable<Visit['followUp']>,
  minutes: number | undefined
): string {
  if (!followUp.notifyMe || minutes === undefined)
    return i18n.t('contactDetails.reminderOff')
  const offset = offsetFromMinutes(minutes)
  if (!offset) return i18n.t('visitDetails_remindAtTime')
  // Plural keys: i18n picks `one` or `other` from the count.
  const key = REMIND_KEYS[offset.unit as keyof typeof REMIND_KEYS]
  return key
    ? i18n.t(key as TranslationKey, { count: offset.amount })
    : i18n.t('visitDetails_remindMinutes' as TranslationKey, {
        count: minutes,
      })
}
