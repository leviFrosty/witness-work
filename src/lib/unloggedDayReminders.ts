import moment from 'moment'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { getStartTimeInMinutes, storedDayKey } from '@/lib/normalizeDate'
import { tracksHours } from '@/lib/publisherCapabilities'
import {
  getEffectiveStartTimeInMinutesForRecurringPlan,
  isRecurringPlanAnytimeOnDate,
  resolvePlannedContributionsForDay,
} from '@/lib/recurrence'
import { roleForMonth, type RoleHistory } from '@/lib/roleHistory'
import { splitMinutes } from '@/lib/entryMinutes'
import type { Publisher } from '@/types/publisher'
import type {
  DayPlan,
  RecurringPlan,
  TimeEntriesByYear,
} from '@/types/timeEntry'

const DAY_MS = 24 * 60 * 60_000

export const UNLOGGED_DAY_HORIZON_MS = 14 * DAY_MS

export const UNLOGGED_DAY_LISTED_MS = 7 * DAY_MS

export const DEFAULT_UNLOGGED_DAY_REMINDER_TIME = 20 * 60

export type UnloggedDaySources = {
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  timeEntries: TimeEntriesByYear

  remindAt: number

  enabledAt: number

  tracksHoursIn: (month: CalendarMonth) => boolean
}

export type UnloggedDay = {
  key: string
  minutes: number

  end: Date

  categoryId?: string
}

export type UnloggedDayPreferences = {
  unloggedDayReminders: boolean
  unloggedDayReminderTime: number
  unloggedDayRemindersEnabledAt: number | null
  role: Publisher
  roleHistory: RoleHistory | null
  logsHours: boolean
}

export function unloggedDaySources(
  records: {
    dayPlans: DayPlan[]
    recurringPlans: RecurringPlan[]
    serviceReports: TimeEntriesByYear
  },
  prefs: UnloggedDayPreferences
): UnloggedDaySources | undefined {
  if (!prefs.unloggedDayReminders) return undefined
  const time = prefs.unloggedDayReminderTime
  return {
    dayPlans: records.dayPlans,
    recurringPlans: records.recurringPlans,
    timeEntries: records.serviceReports,
    remindAt:
      Number.isInteger(time) && time >= 0 && time < 24 * 60
        ? time
        : DEFAULT_UNLOGGED_DAY_REMINDER_TIME,
    enabledAt: prefs.unloggedDayRemindersEnabledAt ?? 0,
    tracksHoursIn: (month) =>
      tracksHours(
        roleForMonth(prefs.roleHistory, prefs.role, month),
        prefs.logsHours
      ),
  }
}

function loggedDays(timeEntries: TimeEntriesByYear) {
  const months = new Map<string, Set<string>>()
  return (day: moment.Moment) => {
    const month = `${day.year()}-${day.month()}`
    let days = months.get(month)
    if (!days) {
      days = new Set(
        (timeEntries[day.year()]?.[day.month()] ?? [])
          .filter((entry) => !entry.rollover)
          .map((entry) => storedDayKey(entry.date))
      )
      months.set(month, days)
    }
    return days.has(day.format('YYYY-MM-DD'))
  }
}

function plannedDay(
  day: moment.Moment,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): UnloggedDay | null {
  const noon = new Date(day.year(), day.month(), day.date(), 12)

  const planned = resolvePlannedContributionsForDay(
    noon,
    dayPlans,
    recurringPlans
  ).filter((contribution) => contribution.minutes > 0)
  if (!planned.length) return null
  const end = Math.max(
    ...planned.map((contribution) => {
      const start =
        contribution.source === 'day'
          ? contribution.plan.anytime
            ? 0
            : getStartTimeInMinutes(contribution.plan)
          : isRecurringPlanAnytimeOnDate(contribution.plan, noon)
            ? 0
            : getEffectiveStartTimeInMinutesForRecurringPlan(
                contribution.plan,
                noon
              )
      return new Date(
        day.year(),
        day.month(),
        day.date(),
        0,
        start + contribution.minutes
      ).getTime()
    })
  )
  const categories = new Set(planned.map(({ plan }) => plan.categoryId))
  const [categoryId] = categories
  return {
    key: day.format('YYYY-MM-DD'),
    minutes: planned.reduce((sum, { minutes }) => sum + minutes, 0),
    end: new Date(end),
    ...(categories.size === 1 && categoryId ? { categoryId } : {}),
  }
}

function firstRemindAt(end: Date, remindAt: number): Date {
  const at = (days: number) =>
    new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate() + days,
      0,
      remindAt
    )
  const sameDay = at(0)
  return sameDay.getTime() >= end.getTime() ? sameDay : at(1)
}

export function unloggedDayReminderGroups(
  sources: UnloggedDaySources,
  now: number
): { date: Date; days: UnloggedDay[] }[] {
  const from = Math.max(sources.enabledAt, now - UNLOGGED_DAY_LISTED_MS)
  const to = now + UNLOGGED_DAY_HORIZON_MS
  const dayPlans = new Map<string, DayPlan[]>()
  for (const plan of sources.dayPlans) {
    const key = storedDayKey(plan.date)
    dayPlans.set(key, [...(dayPlans.get(key) ?? []), plan])
  }
  const isLogged = loggedDays(sources.timeEntries)
  const groups = new Map<number, UnloggedDay[]>()

  const day = moment(from).startOf('day').subtract(2, 'days')
  for (; day.valueOf() <= to; day.add(1, 'day')) {
    if (!sources.tracksHoursIn({ year: day.year(), month: day.month() }))
      continue
    if (isLogged(day)) continue
    const planned = plannedDay(
      day,
      dayPlans.get(day.format('YYYY-MM-DD')) ?? [],
      sources.recurringPlans
    )
    if (!planned) continue
    const date = firstRemindAt(planned.end, sources.remindAt).getTime()
    if (date < from || date > to) continue
    groups.set(date, [...(groups.get(date) ?? []), planned])
  }
  return [...groups]
    .sort(([a], [b]) => a - b)
    .map(([date, days]) => ({ date: new Date(date), days }))
}

export function logPlannedDayParams(
  key: string,
  records: {
    dayPlans: DayPlan[]
    recurringPlans: RecurringPlan[]
    timeEntries: TimeEntriesByYear
  }
): { date: string; hours?: number; minutes?: number; categoryId?: string } {
  const [year, month, date] = key.split('-').map(Number)
  const day = unloggedDay(key, records)
  return {
    date: new Date(year, month - 1, date, 12).toISOString(),
    ...(day
      ? {
          ...splitMinutes(day.minutes),
          categoryId: day.categoryId,
        }
      : {}),
  }
}

export function unloggedDay(
  key: string,
  records: {
    dayPlans: DayPlan[]
    recurringPlans: RecurringPlan[]
    timeEntries: TimeEntriesByYear
  }
): UnloggedDay | null {
  const day = moment(key, 'YYYY-MM-DD', true)
  if (!day.isValid() || loggedDays(records.timeEntries)(day)) return null
  return plannedDay(
    day,
    records.dayPlans.filter((plan) => storedDayKey(plan.date) === key),
    records.recurringPlans
  )
}
