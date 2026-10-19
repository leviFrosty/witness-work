import moment from 'moment'
import { storedDayKey } from '@/lib/normalizeDate'
import { resolvePlannedContributionsForDay } from '@/lib/recurrence'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'

const DAY_MS = 24 * 60 * 60_000
/**
 * How far ahead a device schedules invitations to plan next week: two of them,
 * so a User who doesn't open the app isn't asked every week.
 */
export const WEEK_PLAN_HORIZON_MS = 14 * DAY_MS
/** Saturday, as `moment().day()` numbers it. */
export const DEFAULT_WEEK_PLAN_REMINDER_DAY = 6
/** 6:00 PM, as minutes after midnight. */
export const DEFAULT_WEEK_PLAN_REMINDER_TIME = 18 * 60

export type WeekPlanSources = {
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  /** Off Day weekdays; a week of nothing but Off Days isn't asked about. */
  offDays: number[]
  /** The weekday (0 = Sunday) the reminder goes out. */
  weekday: number
  /** Local minutes after midnight the reminder goes out. */
  remindAt: number
  /** When the setting was turned on. Earlier reminders aren't listed. */
  enabledAt: number
}

/** The Preferences that turn on and tune the invitation to plan next week. */
export type WeekPlanPreferences = {
  weekPlanReminder: boolean
  weekPlanReminderDay: number
  weekPlanReminderTime: number
  weekPlanReminderEnabledAt: number | null
  offDays: number[]
}

/** What invitations to plan next week are built from; undefined when off. */
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

/**
 * The first day (`YYYY-MM-DD`) of the week a reminder at `date` asks about: the
 * calendar week after its own, as the app's Start of Week begins weeks.
 */
export const weekAfter = (date: Date) =>
  moment(date).startOf('week').add(1, 'week').format('YYYY-MM-DD')

/** Whether any day of the week starting `week` has a Plan with time. */
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
    // A zero-minute Plan plans nothing.
    if (planned.some((contribution) => contribution.minutes > 0)) return true
  }
  return false
}

/**
 * Whether the week starting `week` (`YYYY-MM-DD`) still has nothing planned and
 * a day the User might go out: what the invitation to plan it waits on.
 */
export function weekNeedsPlan(
  week: string,
  sources: Pick<WeekPlanSources, 'dayPlans' | 'recurringPlans' | 'offDays'>
): boolean {
  if (!moment(week, 'YYYY-MM-DD', true).isValid()) return false
  // Off Days are weekdays, so a week of only Off Days is all seven of them.
  if (new Set(sources.offDays).size >= 7) return false
  return !weekHasPlans(week, sources.dayPlans, sources.recurringPlans)
}

/**
 * When to invite the User to plan next week: each chosen weekday and time from
 * when the setting was turned on (at most two weeks back, for the tray) through
 * the scheduling horizon, while the week after it has no Plans. Soonest first.
 */
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
