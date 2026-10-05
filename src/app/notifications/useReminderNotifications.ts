import {
  BellRing as BellRingIcon,
  CalendarClock as CalendarClockIcon,
  ClockAlert as ClockAlertIcon,
  UserCheck as UserCheckIcon,
} from 'lucide-react-native'
import moment from 'moment'
import { formatTime, formatWeekdayMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { reminderOccurrences, type LocalReminder } from '@/lib/reminderSchedule'
import {
  UNLOGGED_DAY_LISTED_MS,
  unloggedDaySources,
} from '@/lib/unloggedDayReminders'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import {
  DEFAULT_PLAN_NOTIFICATION_OFFSET,
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import type { Visit } from '@/types/visit'
import type { NotificationItem } from '@/types/notifications'
import { openReminderTarget } from '@/app/notifications/reminderTargets'

const HOUR = 60 * 60_000
/** Missed Follow-ups join the tray four hours after their time. */
const MISSED_FOLLOW_UP_GRACE = 4 * HOUR
const RETURNED_CONTACT_DAYS = 7

/** A reminder's tray id: one per occurrence, so a new time is a new item. */
export const reminderTrayId = (reminder: LocalReminder) =>
  `reminder:${reminder.kind}:${reminder.targetId}:${reminder.date.getTime()}`

/** When a fired reminder stops being useful in the tray. */
function listedUntil(reminder: LocalReminder): number {
  const anchor = reminder.anchor.getTime()
  switch (reminder.kind) {
    case 'visit':
      // Hands over to the missed Follow-up item.
      return anchor + MISSED_FOLLOW_UP_GRACE
    case 'plan':
      return anchor + Math.max(reminder.minutes ?? 0, 60) * 60_000
    case 'contact':
      return anchor + RETURNED_CONTACT_DAYS * 24 * HOUR
    case 'unloggedDay':
      // Leaves sooner once the day has time logged.
      return reminder.date.getTime() + UNLOGGED_DAY_LISTED_MS
  }
}

/** A Visit with the same Contact since the reminder: the Follow-up happened. */
function visitedSince(reminder: LocalReminder, visits: Visit[]) {
  return visits.some(
    (visit) =>
      visit.id !== reminder.targetId &&
      visit.contact.id === reminder.contactId &&
      new Date(visit.date).getTime() >= reminder.date.getTime()
  )
}

/** Local reminders that have fired, from the same intent the OS schedule uses. */
export function firedReminders(
  args: Parameters<typeof reminderOccurrences>[0] & { now: number }
): LocalReminder[] {
  return reminderOccurrences(args).filter(
    (reminder) =>
      reminder.date.getTime() <= args.now &&
      args.now < listedUntil(reminder) &&
      !(reminder.kind === 'visit' && visitedSince(reminder, args.visits))
  )
}

/**
 * The tray copy of each local reminder that has fired: Follow-ups, Plans,
 * returning Contacts, and planned days to log time for. Listed whether or not
 * the system alert was allowed, so the tray is the same record of what reminded
 * the User.
 */
export default function useReminderNotifications(
  now: number
): NotificationItem[] {
  const contacts = useContacts((state) => state.contacts)
  const visits = useConversations((state) => state.conversations)
  const plans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const serviceReports = useServiceReport((state) => state.serviceReports)
  const visitOffset = usePreferences((s) => s.returnVisitNotificationOffset)
  const planOffset = usePreferences((s) => s.planNotificationOffset)
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const unloggedDayReminders = usePreferences((s) => s.unloggedDayReminders)
  const unloggedDayReminderTime = usePreferences(
    (s) => s.unloggedDayReminderTime
  )
  const unloggedDayRemindersEnabledAt = usePreferences(
    (s) => s.unloggedDayRemindersEnabledAt
  )
  const role = usePreferences((s) => s.role)
  const roleHistory = usePreferences((s) => s.roleHistory)
  const logsHours = usePreferences((s) => s.logsHours)

  const open = (reminder: LocalReminder) => () =>
    void openReminderTarget({
      kind: reminder.kind,
      id: reminder.targetId,
      contactId: reminder.contactId,
    })

  return firedReminders({
    contacts,
    visits,
    plans,
    visitOffset: {
      ...DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
      ...visitOffset,
    },
    planOffset: { ...DEFAULT_PLAN_NOTIFICATION_OFFSET, ...planOffset },
    unloggedDays: unloggedDaySources(
      { dayPlans: plans, recurringPlans, serviceReports },
      {
        unloggedDayReminders,
        unloggedDayReminderTime,
        unloggedDayRemindersEnabledAt,
        role,
        roleHistory,
        logsHours,
      }
    ),
    now,
  }).map((reminder): NotificationItem => {
    const base = {
      id: reminderTrayId(reminder),
      kind: 'reminder' as const,
      at: reminder.date.getTime(),
      tone: 'accent' as const,
    }
    const time = formatTime(reminder.anchor)
    switch (reminder.kind) {
      case 'visit':
        return {
          ...base,
          icon: CalendarClockIcon,
          title: i18n.t('notifications_reminderFollowUp', {
            name: reminder.name ?? '',
            time,
          }),
          description: reminder.note?.trim() || undefined,
          actions: [
            { id: 'open', label: i18n.t('open'), onPress: open(reminder) },
          ],
        }
      case 'plan':
        return {
          ...base,
          icon: BellRingIcon,
          title:
            reminder.title?.trim() ||
            i18n.t('notifications_reminderPlan', { time }),
          description: [
            reminder.title?.trim() ? time : undefined,
            formatMinutes(reminder.minutes ?? 0, timeDisplayFormat).formatted,
            reminder.note?.trim() || undefined,
          ]
            .filter(Boolean)
            .join(' · '),
          actions: [
            { id: 'open', label: i18n.t('open'), onPress: open(reminder) },
          ],
        }
      case 'unloggedDay': {
        const days = reminder.days?.length ?? 1
        return {
          ...base,
          icon: ClockAlertIcon,
          title:
            days > 1
              ? // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
                i18n.t('notifications_reminderUnloggedDays', { count: days })
              : i18n.t('notifications_reminderUnloggedDay', {
                  date: formatWeekdayMonthDayCompact(
                    moment(reminder.targetId, 'YYYY-MM-DD')
                  ),
                }),
          description:
            days > 1
              ? undefined
              : i18n.t('notifications_reminderUnloggedDayPlanned', {
                  duration: formatMinutes(
                    reminder.minutes ?? 0,
                    timeDisplayFormat
                  ).formatted,
                }),
          actions: [
            {
              id: 'add_time',
              label: i18n.t('addTime'),
              onPress: open(reminder),
            },
          ],
        }
      }
      case 'contact':
        return {
          ...base,
          icon: UserCheckIcon,
          title: i18n.t('contactAvailableReminder', {
            name: reminder.name ?? '',
          }),
          actions: [
            { id: 'open', label: i18n.t('open'), onPress: open(reminder) },
          ],
        }
    }
  })
}
