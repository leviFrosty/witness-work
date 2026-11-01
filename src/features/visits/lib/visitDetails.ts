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

export function detailsDateTime(date: Date): string {
  const day = moment(date)
  const dayLabel = day.isSame(moment(), 'year')
    ? formatWeekdayMonthDayCompact(day)
    : formatDate(day, { style: 'medium' })
  return `${dayLabel} · ${formatTime(date)}`
}

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

export function reminderSentence(
  followUp: NonNullable<Visit['followUp']>,
  minutes: number | undefined
): string {
  if (!followUp.notifyMe || minutes === undefined)
    return i18n.t('contactDetails.reminderOff')
  const offset = offsetFromMinutes(minutes)
  if (!offset) return i18n.t('visitDetails_remindAtTime')

  const key = REMIND_KEYS[offset.unit as keyof typeof REMIND_KEYS]
  return key
    ? i18n.t(key as TranslationKey, { count: offset.amount })
    : i18n.t('visitDetails_remindMinutes' as TranslationKey, {
        count: minutes,
      })
}
