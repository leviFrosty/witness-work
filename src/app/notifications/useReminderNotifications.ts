import {
  BellRing as BellRingIcon,
  CalendarClock as CalendarClockIcon,
  CalendarPlus as CalendarPlusIcon,
  ClockAlert as ClockAlertIcon,
  Flame as FlameIcon,
  UserCheck as UserCheckIcon,
} from 'lucide-react-native'
import moment from 'moment'
import {
  formatMonthDayCompact,
  formatTime,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import { serviceStreakFor } from '@/lib/currentServiceStreak'
import { streakRemindersOn } from '@/lib/serviceStreak'
import i18n from '@/lib/locales'
import { reminderContent } from '@/lib/reminderContent'
import { formatMinutes } from '@/lib/minutes'
import { reminderOccurrences, type LocalReminder } from '@/lib/reminderSchedule'
import {
  UNLOGGED_DAY_LISTED_MS,
  unloggedDaySources,
} from '@/lib/unloggedDayReminders'
import { weekPlanSources } from '@/lib/weekPlanReminders'
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

const MISSED_FOLLOW_UP_GRACE = 4 * HOUR
const RETURNED_CONTACT_DAYS = 7

export const reminderTrayId = (reminder: LocalReminder) =>
  `reminder:${reminder.kind}:${reminder.targetId}:${reminder.date.getTime()}`

type TrayReminder = LocalReminder & {
  kind: Exclude<LocalReminder['kind'], 'monthReport'>
}

function listedUntil(reminder: TrayReminder): number {
  const anchor = reminder.anchor.getTime()
  switch (reminder.kind) {
    case 'visit':
      return anchor + MISSED_FOLLOW_UP_GRACE
    case 'plan':
      return anchor + Math.max(reminder.minutes ?? 0, 60) * 60_000
    case 'contact':
      return anchor + RETURNED_CONTACT_DAYS * 24 * HOUR
    case 'unloggedDay':
      return reminder.date.getTime() + UNLOGGED_DAY_LISTED_MS
    case 'streak':
      return anchor
    case 'weekPlan':
      return moment(reminder.anchor).add(1, 'week').valueOf()
  }
}

function visitedSince(reminder: LocalReminder, visits: Visit[]) {
  return visits.some(
    (visit) =>
      visit.id !== reminder.targetId &&
      visit.contact.id === reminder.contactId &&
      new Date(visit.date).getTime() >= reminder.date.getTime()
  )
}

export function firedReminders(
  args: Parameters<typeof reminderOccurrences>[0] & { now: number }
): TrayReminder[] {
  return reminderOccurrences(args)
    .filter(
      (reminder): reminder is TrayReminder => reminder.kind !== 'monthReport'
    )
    .filter(
      (reminder) =>
        reminder.date.getTime() <= args.now &&
        args.now < listedUntil(reminder) &&
        !(reminder.kind === 'visit' && visitedSince(reminder, args.visits))
    )
}

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
  const weekPlanReminder = usePreferences((s) => s.weekPlanReminder)
  const weekPlanReminderDay = usePreferences((s) => s.weekPlanReminderDay)
  const weekPlanReminderTime = usePreferences((s) => s.weekPlanReminderTime)
  const weekPlanReminderEnabledAt = usePreferences(
    (s) => s.weekPlanReminderEnabledAt
  )
  const offDays = usePreferences((s) => s.offDays)
  const streakReminders = usePreferences(streakRemindersOn)
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)

  const open = (reminder: LocalReminder) => () =>
    void openReminderTarget({
      kind: reminder.kind,
      id: reminder.targetId,
      contactId: reminder.contactId,
      day: reminder.day,
    })

  return firedReminders({
    contacts,
    visits,
    plans,
    recurringPlans,
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
    streak: streakReminders
      ? serviceStreakFor(
          { role, roleHistory },
          { serviceReports, dayPlans: plans, recurringPlans },
          new Date(now)
        )
      : undefined,
    weekPlan: weekPlanSources(
      { dayPlans: plans, recurringPlans },
      {
        weekPlanReminder,
        weekPlanReminderDay,
        weekPlanReminderTime,
        weekPlanReminderEnabledAt,
        offDays,
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
              ? i18n.t('notifications_reminderUnloggedDays', { count: days })
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
      case 'streak': {
        const { title, body } = reminderContent(reminder, {
          dataProtectionMode,
          timeDisplayFormat,
        })
        return {
          ...base,
          tone: 'warn',
          icon: FlameIcon,
          title,
          description: body,
          actions: [
            {
              id: 'keep_streak',
              label:
                reminder.streak?.kind === 'months'
                  ? i18n.t('open')
                  : i18n.t('addTime'),
              onPress: open(reminder),
            },
          ],
        }
      }
      case 'weekPlan':
        return {
          ...base,
          icon: CalendarPlusIcon,
          title: i18n.t('notifications_reminderWeekPlan', {
            date: formatMonthDayCompact(
              moment(reminder.targetId, 'YYYY-MM-DD')
            ),
          }),
          actions: [
            {
              id: 'open_schedule',
              label: i18n.t('openSchedule'),
              onPress: open(reminder),
            },
          ],
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
