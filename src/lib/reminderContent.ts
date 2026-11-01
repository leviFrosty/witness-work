import moment from 'moment'
import {
  formatMonthDayCompact,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import i18n from '@/lib/locales'
import { calendarDaysBetween } from '@/lib/normalizeDate'
import { deriveOffsetFromDates } from '@/lib/notificationOffset'
import { formatMinutes } from '@/lib/minutes'
import type { MinuteDisplayFormat } from '@/types/timeEntry'
import type { LocalReminder } from '@/lib/reminderSchedule'
import type { ReminderData } from '@/lib/notificationData'

const LEAD_KEYS = {
  minutes: 'reminderLeadMinutes',
  hours: 'reminderLeadHours',
  days: 'reminderLeadDays',
  weeks: 'reminderLeadWeeks',
} as const

export function reminderLead(anchor: Date, fireAt: Date): string | null {
  const offset = deriveOffsetFromDates(anchor, fireAt)
  if (!offset) return null
  const key =
    LEAD_KEYS[offset.unit as keyof typeof LEAD_KEYS] ?? LEAD_KEYS.minutes

  return i18n.t(key, { count: offset.amount })
}

export function reminderContent(
  reminder: LocalReminder,
  options: {
    dataProtectionMode: boolean
    timeDisplayFormat: MinuteDisplayFormat
  }
): { title: string; body: string; data: { reminder: ReminderData } } {
  const data: { reminder: ReminderData } = {
    reminder: {
      kind: reminder.kind,
      id: reminder.targetId,
      ...(reminder.contactId ? { contactId: reminder.contactId } : {}),
      ...(reminder.day ? { day: reminder.day } : {}),
    },
  }
  const lead = reminderLead(reminder.anchor, reminder.date)
  const name = options.dataProtectionMode ? undefined : reminder.name
  switch (reminder.kind) {
    case 'visit': {
      const body = name
        ? lead
          ? i18n.t('visitReminderBody', { name, lead })
          : i18n.t('visitReminderBodyNow', { name })
        : lead
          ? i18n.t('visitReminderBodyPrivate', { lead })
          : i18n.t('visitReminderBodyNowPrivate')
      const topic =
        !options.dataProtectionMode && reminder.note?.trim()
          ? `\n${i18n.t('reminder_topicLine', { topic: reminder.note.trim() })}`
          : ''
      return { title: i18n.t('reminder_title'), body: body + topic, data }
    }
    case 'plan': {
      const duration = formatMinutes(
        reminder.minutes ?? 0,
        options.timeDisplayFormat
      ).formatted
      const body = lead
        ? i18n.t('planReminderBody', { lead, duration })
        : i18n.t('planReminderBodyNow', { duration })
      const note = reminder.note?.trim() ? `\n${reminder.note.trim()}` : ''
      return {
        title: reminder.title?.trim() || i18n.t('plan_reminder_title'),
        body: body + note,
        data,
      }
    }
    case 'unloggedDay': {
      const days = reminder.days?.length ?? 1
      const day = moment(reminder.targetId, 'YYYY-MM-DD')
      const daysAgo = calendarDaysBetween(day, reminder.date)
      const duration = formatMinutes(
        reminder.minutes ?? 0,
        options.timeDisplayFormat
      ).formatted
      const body =
        days > 1
          ? i18n.t('unloggedDayReminderBodyDays', { count: days })
          : daysAgo === 0
            ? i18n.t('unloggedDayReminderBodyToday', { duration })
            : daysAgo === 1
              ? i18n.t('unloggedDayReminderBodyYesterday', { duration })
              : i18n.t('unloggedDayReminderBodyOnDate', {
                  duration,
                  date: formatWeekdayMonthDayCompact(day),
                })
      return { title: i18n.t('unloggedDayReminder_title'), body, data }
    }
    case 'streak': {
      const period = moment(reminder.targetId, 'YYYY-MM-DD')
      const count = reminder.streak?.count ?? 0
      return {
        title: i18n.t('streakReminder_title'),
        body:
          reminder.streak?.kind === 'months'
            ? i18n.t('streakReminderBodyMonths', {
                month: period.format('MMMM'),
                date: formatWeekdayMonthDayCompact(
                  moment(reminder.anchor).subtract(1, 'day')
                ),
                count,
              })
            : i18n.t('streakReminderBodyPlans', {
                date: formatWeekdayMonthDayCompact(period),
                count,
              }),
        data,
      }
    }
    case 'monthReport':
      return {
        title: i18n.t('monthReportReminder_title', {
          month: moment(reminder.targetId, 'YYYY-MM').format('MMMM'),
        }),
        body: i18n.t('monthReportReminder_body'),
        data,
      }
    case 'weekPlan':
      return {
        title: i18n.t('weekPlanReminder_title'),
        body: i18n.t('weekPlanReminderBody', {
          date: formatMonthDayCompact(moment(reminder.targetId, 'YYYY-MM-DD')),
        }),
        data,
      }
    case 'contact':
      return {
        title: i18n.t('contactAvailableAgain'),
        body: name
          ? i18n.t('contactAvailableReminder', { name })
          : i18n.t('contactAvailableReminderPrivate'),
        data,
      }
  }
}
