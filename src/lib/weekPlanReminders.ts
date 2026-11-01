import moment from 'moment'
import { storedDayKey } from '@/lib/normalizeDate'
import { resolvePlannedContributionsForDay } from '@/lib/recurrence'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'

const DAY_MS = 24 * 60 * 60_000

export const WEEK_PLAN_HORIZON_MS = 14 * DAY_MS

export const DEFAULT_WEEK_PLAN_REMINDER_DAY = 6

export const DEFAULT_WEEK_PLAN_REMINDER_TIME = 18 * 60

export type WeekPlanSources = {
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]

  offDays: number[]

  weekday: number

  remindAt: number

  enabledAt: number
}

export type WeekPlanPreferences = {
  weekPlanReminder: boolean
  weekPlanReminderDay: number
  weekPlanReminderTime: number
  weekPlanReminderEnabledAt: number | null
  offDays: number[]
}

export function weekPlanSources(
  records: { dayPlans: DayPlan[]; recurringPlans: RecurringPlan[] },
  prefs: WeekPlanPreferences
): WeekPlanSources | undefined {
  if (!prefs.weekPlanReminder) return undefined
  const day = prefs.weekPlanReminderDay
  const time = prefs.weekPlanReminderTime
  return {
    dayPlans: records.dayPlans,
    recurringPlans: records.recurringPlans,
    offDays: prefs.offDays,
    weekday:
      Number.isInteger(day) && day >= 0 && day < 7
        ? day
        : DEFAULT_WEEK_PLAN_REMINDER_DAY,
    remindAt:
      Number.isInteger(time) && time >= 0 && time < 24 * 60
        ? time
        : DEFAULT_WEEK_PLAN_REMINDER_TIME,
    enabledAt: prefs.weekPlanReminderEnabledAt ?? 0,
  }
}

export const weekAfter = (date: Date) =>
  moment(date).startOf('week').add(1, 'week').format('YYYY-MM-DD')

function weekHasPlans(
  week: string,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): boolean {
  const day = moment(week, 'YYYY-MM-DD')
  for (let i = 0; i < 7; i++, day.add(1, 'day')) {
    const key = day.format('YYYY-MM-DD')
    const noon = new Date(day.year(), day.month(), day.date(), 12)
    const planned = resolvePlannedContributionsForDay(
      noon,
      dayPlans.filter((plan) => storedDayKey(plan.date) === key),
      recurringPlans
    )

    if (planned.some((contribution) => contribution.minutes > 0)) return true
  }
  return false
}

export function weekNeedsPlan(
  week: string,
  sources: Pick<WeekPlanSources, 'dayPlans' | 'recurringPlans' | 'offDays'>
): boolean {
  if (!moment(week, 'YYYY-MM-DD', true).isValid()) return false

  if (new Set(sources.offDays).size >= 7) return false
  return !weekHasPlans(week, sources.dayPlans, sources.recurringPlans)
}

export function weekPlanReminderDates(
  sources: WeekPlanSources,
  now: number
): { date: Date; week: string }[] {
  const from = Math.max(sources.enabledAt, now - WEEK_PLAN_HORIZON_MS)
  const to = now + WEEK_PLAN_HORIZON_MS
  const reminders: { date: Date; week: string }[] = []
  const day = moment(from).startOf('day')
  for (; day.valueOf() <= to; day.add(1, 'day')) {
    if (day.day() !== sources.weekday) continue
    const date = new Date(
      day.year(),
      day.month(),
      day.date(),
      0,
      sources.remindAt
    )
    if (date.getTime() < from || date.getTime() > to) continue
    const week = weekAfter(date)
    if (weekNeedsPlan(week, sources)) reminders.push({ date, week })
  }
  return reminders
}
