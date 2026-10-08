import moment from 'moment'
import { storedDayKey } from '@/lib/normalizeDate'
import { resolvePlannedContributionsForDay } from '@/lib/recurrence'
import type {
  DayPlan,
  RecurringPlan,
  TimeEntriesByYear,
} from '@/types/timeEntry'

/**
 * What a Service Streak counts (`getStreakKind`):
 *
 * - `plans`: planned days kept. A day with a Plan counts once it has any time
 *   logged, however short of the Plan. Days without a Plan neither add to it
 *   nor break it.
 * - `months`: months in service, for a role that reports a monthly "shared in the
 *   ministry". Any Time Entry counts, the checkbox included.
 *
 * A day or month can still be kept through the one after it; the streak ends
 * once that passes with nothing logged.
 */
export type StreakKind = 'plans' | 'months'

/** A streak shows, and is celebrated, once it's this long. */
export const STREAK_MIN = 3

const DAY = 'YYYY-MM-DD'
/** How far back a streak is counted, so bad data can't loop for long. */
const MAX_LOOKBACK_DAYS = 3650
/** How far ahead the next Plan is looked for. */
const PLANS_AHEAD_DAYS = 56
/** A reminder goes out at 6 PM, while there's still time. */
const REMINDER_HOUR = 18

export type ServiceStreak = {
  kind: StreakKind
  count: number
  /** The newest counted day, or month's 1st (`YYYY-MM-DD`); null at 0. */
  latest: string | null
  /**
   * The next planned day (or month) not kept yet, and when the streak ends
   * unless it's kept: the end of the day (or month) after it. Null with no Plan
   * ahead.
   */
  due: { period: string; endsAt: Date } | null
}

export type StreakRecords = {
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}

/**
 * Days with a Time Entry → the minutes logged on them. A 0h entry still marks
 * its day: it's the checkbox "shared" marker. Time Rollover halves only move
 * minutes between months, so they aren't service on their day.
 */
export function serviceDays(reports: TimeEntriesByYear): Map<string, number> {
  const days = new Map<string, number>()
  for (const year of Object.values(reports)) {
    for (const month of Object.values(year)) {
      for (const entry of month) {
        if (entry.rollover) continue
        const key = storedDayKey(entry.date)
        const minutes = (entry.hours || 0) * 60 + (entry.minutes || 0)
        days.set(key, (days.get(key) ?? 0) + minutes)
      }
    }
  }
  return days
}

function plansStreak(records: StreakRecords, now: Date): ServiceStreak {
  const days = serviceDays(records.serviceReports)
  const dayPlans = new Map<string, DayPlan[]>()
  let earliest: string | null = null
  for (const plan of records.dayPlans) {
    const key = storedDayKey(plan.date)
    dayPlans.set(key, [...(dayPlans.get(key) ?? []), plan])
    if (!earliest || key < earliest) earliest = key
  }
  for (const plan of records.recurringPlans) {
    const key = storedDayKey(plan.startDate)
    if (!earliest || key < earliest) earliest = key
  }
  if (!earliest) return { kind: 'plans', count: 0, latest: null, due: null }

  const isPlanned = (day: moment.Moment) =>
    resolvePlannedContributionsForDay(
      new Date(day.year(), day.month(), day.date(), 12),
      dayPlans.get(day.format(DAY)) ?? [],
      records.recurringPlans
    ).some((contribution) => contribution.minutes > 0)
  const isKept = (key: string) => (days.get(key) ?? 0) > 0

  const today = moment(now).startOf('day')
  let count = 0
  let latest: string | null = null
  const cursor = today.clone()
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++, cursor.subtract(1, 'day')) {
    const key = cursor.format(DAY)
    if (key < earliest) break
    if (!isPlanned(cursor)) continue
    if (isKept(key)) {
      count++
      latest ??= key
    } else if (i > 1) break
    // Today and yesterday can still be logged.
  }

  let due: ServiceStreak['due'] = null
  const ahead = today.clone().subtract(1, 'day')
  for (let i = -1; i <= PLANS_AHEAD_DAYS; i++, ahead.add(1, 'day')) {
    const key = ahead.format(DAY)
    if (!isPlanned(ahead) || (i <= 0 && isKept(key))) continue
    due = {
      period: key,
      endsAt: ahead.clone().add(2, 'days').toDate(),
    }
    break
  }
  return { kind: 'plans', count, latest, due }
}

function monthsStreak(records: StreakRecords, now: Date): ServiceStreak {
  const months = new Set<string>()
  for (const day of serviceDays(records.serviceReports).keys())
    months.add(`${day.slice(0, 7)}-01`)
  const has = (month: moment.Moment) => months.has(month.format(DAY))

  const current = moment(now).startOf('month')
  let count = 0
  let latest: string | null = null
  const cursor = current.clone()
  for (
    let i = 0;
    i < MAX_LOOKBACK_DAYS / 30;
    i++, cursor.subtract(1, 'month')
  ) {
    if (has(cursor)) {
      count++
      latest ??= cursor.format(DAY)
    } else if (i > 1) break
    // This month and last can still be recorded.
  }

  let due: ServiceStreak['due'] = null
  const ahead = current.clone().subtract(1, 'month')
  for (let i = -1; i <= 1; i++, ahead.add(1, 'month')) {
    if (i <= 0 && has(ahead)) continue
    due = {
      period: ahead.format(DAY),
      endsAt: ahead.clone().add(2, 'months').toDate(),
    }
    break
  }
  return { kind: 'months', count, latest, due }
}

let cached: {
  kind: StreakKind
  day: string
  records: StreakRecords
  streak: ServiceStreak
} | null = null

/**
 * The User's Service Streak as of `now`. Every surface asks for the same one,
 * so the last result is kept until the records or the day change.
 */
export function serviceStreak(
  kind: StreakKind,
  records: StreakRecords,
  now: Date = new Date()
): ServiceStreak {
  const day = moment(now).format(DAY)
  if (
    cached &&
    cached.kind === kind &&
    cached.day === day &&
    cached.records.serviceReports === records.serviceReports &&
    cached.records.dayPlans === records.dayPlans &&
    cached.records.recurringPlans === records.recurringPlans
  )
    return cached.streak
  const streak =
    kind === 'plans' ? plansStreak(records, now) : monthsStreak(records, now)
  cached = { kind, day, records, streak }
  return streak
}

/** The count people see; a streak shorter than `STREAK_MIN` isn't shown. */
export const shownStreak = (streak: ServiceStreak): number =>
  streak.count >= STREAK_MIN ? streak.count : 0

/**
 * Whether a shown streak ends soon without more service: within a day for Plans
 * (yesterday's still needs time), a week for months.
 */
export function streakEndsSoon(streak: ServiceStreak, now: Date): boolean {
  if (!shownStreak(streak) || !streak.due) return false
  const left = streak.due.endsAt.getTime() - now.getTime()
  const soon = streak.kind === 'plans' ? 1 : 7
  return left > 0 && left <= soon * 24 * 60 * 60_000
}

/**
 * When to remind the User that a shown streak is about to end: 6 PM on its last
 * day for Plans, three days before the month is out for months.
 */
export function streakReminderAt(streak: ServiceStreak): Date | null {
  if (!shownStreak(streak) || !streak.due) return null
  return moment(streak.due.endsAt)
    .subtract(streak.kind === 'plans' ? 1 : 3, 'days')
    .hour(REMINDER_HOUR)
    .toDate()
}

/**
 * The last day (`YYYY-MM-DD`) the streak lasts without more service. With no
 * Plan ahead it can't end yet; a new Plan republishes it.
 */
export function streakLastsThrough(streak: ServiceStreak, now: Date): string {
  return streak.due
    ? moment(streak.due.endsAt).subtract(1, 'day').format(DAY)
    : moment(now).add(PLANS_AHEAD_DAYS, 'days').format(DAY)
}

const PLAN_MILESTONES = [3, 5, 10, 15, 20, 25, 30, 40, 50]

/**
 * Whether reaching `count` earns the full celebration. Kept Plans come often,
 * so only milestones do; a month comes once a month, so each one does.
 */
export function isStreakMilestone(kind: StreakKind, count: number): boolean {
  if (count < STREAK_MIN) return false
  if (kind === 'months') return true
  return PLAN_MILESTONES.includes(count) || (count > 50 && count % 25 === 0)
}

/** The newest period this device has seen counted, for unlock detection. */
export type SeenStreak = { kind: StreakKind; latest: string | null }

/**
 * Whether `current` grows the streak since `seen`, and what to remember next.
 * It grows when a newer planned day (or month) is kept than any seen before, so
 * backfilling an old one, more time on the same day, or deleting and re-adding
 * an entry doesn't replay it. Only growth that's still recent counts (yesterday
 * on, or last month on), so a device catching up after a while, or data that
 * arrives by restore, isn't celebrated late. With nothing seen yet (first
 * launch, records still loading) or a new kind (role change), it only starts
 * remembering.
 */
export function nextSeenStreak(
  seen: SeenStreak | null,
  current: Pick<ServiceStreak, 'kind' | 'count' | 'latest'>,
  now: Date = new Date()
): { seen: SeenStreak; grew: boolean } {
  if (!seen || seen.kind !== current.kind)
    return {
      seen: { kind: current.kind, latest: current.latest },
      grew: false,
    }
  if (
    current.latest === null ||
    (seen.latest !== null && current.latest <= seen.latest)
  )
    return { seen, grew: false }
  const unit = current.kind === 'plans' ? 'day' : 'month'
  const recent =
    current.latest >= moment(now).subtract(1, unit).startOf(unit).format(DAY)
  return {
    seen: { kind: current.kind, latest: current.latest },
    grew: seen.latest !== null && recent && current.count >= STREAK_MIN,
  }
}
