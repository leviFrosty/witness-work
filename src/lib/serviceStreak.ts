import moment from 'moment'
import { storedDayKey } from '@/lib/normalizeDate'
import { resolvePlannedContributionsForDay } from '@/lib/recurrence'
import { entryMinutes } from '@/lib/entryMinutes'
import type {
  DayPlan,
  RecurringPlan,
  TimeEntriesByYear,
} from '@/types/timeEntry'

export type StreakKind = 'plans' | 'months'

export const STREAK_MIN = 3

const DAY = 'YYYY-MM-DD'

const MAX_LOOKBACK_DAYS = 3650

const PLANS_AHEAD_DAYS = 56

const REMINDER_HOUR = 18

export type ServiceStreak = {
  kind: StreakKind
  count: number

  latest: string | null

  since: string | null

  due: { period: string; endsAt: Date } | null
}

export type StreakRecords = {
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}

export function serviceDays(reports: TimeEntriesByYear): Map<string, number> {
  const days = new Map<string, number>()
  for (const year of Object.values(reports)) {
    for (const month of Object.values(year)) {
      for (const entry of month) {
        if (entry.rollover) continue
        const key = storedDayKey(entry.date)
        const minutes = entryMinutes(entry)
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
  if (!earliest)
    return { kind: 'plans', count: 0, latest: null, since: null, due: null }

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
  let since: string | null = null
  const cursor = today.clone()
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++, cursor.subtract(1, 'day')) {
    const key = cursor.format(DAY)
    if (key < earliest) break
    if (!isPlanned(cursor)) continue
    if (isKept(key)) {
      count++
      latest ??= key
      since = key
    } else if (i > 1) break
  }

  let due: ServiceStreak['due'] = null
  const ahead = today.clone().subtract(1, 'day')
  for (let i = -1; i <= PLANS_AHEAD_DAYS; i++, ahead.add(1, 'day')) {
    const key = ahead.format(DAY)
    if (!isPlanned(ahead) || (i <= 0 && isKept(key))) continue
    due = {
      period: key,

      endsAt: ahead.clone().add(2, 'days').startOf('day').toDate(),
    }
    break
  }
  return { kind: 'plans', count, latest, since, due }
}

function monthsStreak(records: StreakRecords, now: Date): ServiceStreak {
  const months = new Set<string>()
  for (const day of serviceDays(records.serviceReports).keys())
    months.add(`${day.slice(0, 7)}-01`)
  const has = (month: moment.Moment) => months.has(month.format(DAY))

  const current = moment(now).startOf('month')
  let count = 0
  let latest: string | null = null
  let since: string | null = null
  const cursor = current.clone()
  for (
    let i = 0;
    i < MAX_LOOKBACK_DAYS / 30;
    i++, cursor.subtract(1, 'month')
  ) {
    if (has(cursor)) {
      count++
      latest ??= cursor.format(DAY)
      since = cursor.format(DAY)
    } else if (i > 1) break
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
  return { kind: 'months', count, latest, since, due }
}

let cached: {
  kind: StreakKind
  day: string
  records: StreakRecords
  streak: ServiceStreak
} | null = null

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

export const shownStreak = (streak: ServiceStreak): number =>
  Math.max(0, streak.count)

export const streakRemindersOn = (prefs: {
  streakReminders: boolean
  showStreaks: boolean
}): boolean => prefs.streakReminders && prefs.showStreaks

export function streakEndsSoon(streak: ServiceStreak, now: Date): boolean {
  if (!shownStreak(streak) || !streak.due) return false
  const { endsAt } = streak.due

  const from = moment(endsAt)
    .subtract(streak.kind === 'plans' ? 1 : 7, 'days')
    .startOf('day')
  return now.getTime() >= from.valueOf() && now < endsAt
}

export function streakReminderAt(streak: ServiceStreak): Date | null {
  if (streak.count < STREAK_MIN || !streak.due) return null
  return moment(streak.due.endsAt)
    .subtract(streak.kind === 'plans' ? 1 : 3, 'days')
    .hour(REMINDER_HOUR)
    .toDate()
}

export function streakLastsThrough(streak: ServiceStreak, now: Date): string {
  return streak.due
    ? moment(streak.due.endsAt).subtract(1, 'day').format(DAY)
    : moment(now).add(PLANS_AHEAD_DAYS, 'days').format(DAY)
}

const PLAN_MILESTONES = [3, 5, 10, 15, 20, 25, 30, 40, 50]

export function isStreakMilestone(kind: StreakKind, count: number): boolean {
  if (count < STREAK_MIN) return false
  if (kind === 'months') return true
  return PLAN_MILESTONES.includes(count) || (count > 50 && count % 25 === 0)
}

export type SeenStreak = { kind: StreakKind; latest: string | null }

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

export type StreakMilestone = {
  count: number

  on: string
}

export type StreakHistory = {
  kept: readonly string[]

  milestones: readonly StreakMilestone[]

  best: number
}

const NO_HISTORY: StreakHistory = { kept: [], milestones: [], best: 0 }

const dayKeyOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function streakCounter() {
  const kept: string[] = []
  const missed: string[] = []
  let breaks = 0
  let start = 0
  return {
    miss: (period: string) => missed.push(period),

    keep: (period: string, before: string): number => {
      while (breaks < missed.length && missed[breaks] < before) breaks++
      const ended = breaks ? missed[breaks - 1] : null
      while (ended && start < kept.length && kept[start] < ended) start++
      kept.push(period)
      return kept.length - start
    },
    kept,
  }
}

function plansHistory(
  records: StreakRecords,
  now: Date,
  milestones: boolean
): StreakHistory {
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
  if (!earliest) return NO_HISTORY

  const today = dayKeyOf(now)
  const from = moment(earliest, DAY)
  const cursor = new Date(from.year(), from.month(), from.date(), 12)
  const streak = streakCounter()
  const reached: StreakMilestone[] = []
  let best = 0
  let before = ''
  for (
    let i = 0;
    i < MAX_LOOKBACK_DAYS;
    i++, cursor.setDate(cursor.getDate() + 1)
  ) {
    const key = dayKeyOf(cursor)
    if (key > today) break
    const planned = resolvePlannedContributionsForDay(
      cursor,
      dayPlans.get(key) ?? [],
      records.recurringPlans
    ).some((contribution) => contribution.minutes > 0)
    if (planned && (days.get(key) ?? 0) > 0) {
      const count = streak.keep(key, before)
      best = Math.max(best, count)
      if (milestones && isStreakMilestone('plans', count))
        reached.push({ count, on: key })
    } else if (planned) streak.miss(key)
    before = key
  }
  return { kept: streak.kept, milestones: reached, best }
}

function monthsHistory(
  records: StreakRecords,
  now: Date
): Omit<StreakHistory, 'kept'> {
  const firstDays = new Map<string, string>()
  for (const day of serviceDays(records.serviceReports).keys()) {
    const month = `${day.slice(0, 7)}-01`
    const first = firstDays.get(month)
    if (!first || day < first) firstDays.set(month, day)
  }
  if (!firstDays.size) return { milestones: [], best: 0 }
  const current = moment(now).startOf('month')
  const cursor = moment([...firstDays.keys()].sort()[0], DAY)
  const streak = streakCounter()
  const reached: StreakMilestone[] = []
  let best = 0
  let before = ''
  for (
    let i = 0;
    i < MAX_LOOKBACK_DAYS / 30 && !cursor.isAfter(current);
    i++, cursor.add(1, 'month')
  ) {
    const month = cursor.format(DAY)
    const first = firstDays.get(month)
    if (first) {
      const count = streak.keep(month, before)
      best = Math.max(best, count)
      if (isStreakMilestone('months', count)) reached.push({ count, on: first })
    } else streak.miss(month)
    before = month
  }
  return { milestones: reached, best }
}

let cachedHistory: {
  kind: StreakKind
  day: string
  records: StreakRecords
  history: StreakHistory
} | null = null

export function streakHistory(
  kind: StreakKind,
  records: StreakRecords,
  now: Date = new Date()
): StreakHistory {
  const day = moment(now).format(DAY)
  if (
    cachedHistory &&
    cachedHistory.kind === kind &&
    cachedHistory.day === day &&
    cachedHistory.records.serviceReports === records.serviceReports &&
    cachedHistory.records.dayPlans === records.dayPlans &&
    cachedHistory.records.recurringPlans === records.recurringPlans
  )
    return cachedHistory.history
  const plans = plansHistory(records, now, kind === 'plans')
  const history =
    kind === 'plans'
      ? plans
      : { kept: plans.kept, ...monthsHistory(records, now) }
  cachedHistory = { kind, day, records, history }
  return history
}
