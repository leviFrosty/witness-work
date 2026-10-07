import moment from 'moment'
import {
  BADGE_COLLECTIONS,
  BadgeCollectionSpec,
  YEAR_ROUND_MONTHS,
  badgeKey,
} from '@/lib/badges/catalog'
import { storedDayKey } from '@/lib/normalizeDate'
import {
  RecurringPlanFrequencies,
  getPlansIntersectingDay,
} from '@/lib/recurrence'
import { isCountableEntry } from '@/lib/serviceReport'
import {
  BADGE_LEVELS,
  BadgeCollectionId,
  BadgeKey,
  BadgeLevel,
  EarnedBadge,
  OneTimeBadgeId,
} from '@/types/badges'
import { DayPlan, RecurringPlan, TimeEntriesByYear } from '@/types/timeEntry'
import { Visit } from '@/types/visit'

export type BadgeEvaluationInput = {
  now: Date
  serviceReports: TimeEntriesByYear
  dayPlans: readonly DayPlan[]
  recurringPlans: readonly RecurringPlan[]
  visits: readonly Visit[]
  /** `YYYY-MM` months whose report the User sent onward. */
  submittedReportMonths: readonly string[]
  /** Stored `badgeLedger` entries (`<collection>:<YYYY-MM>`). */
  ledger: readonly string[]
  /**
   * `YYYY-MM` months, up to today, that had a Plan or Follow-up a buddy went
   * along to. Derived in the app tier, which can read Buddies data.
   */
  togetherMonths: readonly string[]
  hasActiveBuddy: boolean
}

export type CollectionProgress = {
  id: BadgeCollectionId
  /** Months (or Service Years, or months with one person) counted so far. */
  count: number
  /** Highest level reached, 0 when none yet. */
  level: BadgeLevel | 0
  /** What reaches the next level, null once Pearl is reached. */
  next: number | null
  /** The `YYYY-MM` that reached each level, Bronze first, when known. */
  reachedMonths: (string | undefined)[]
}

export type BadgeEvaluation = {
  collections: Record<BadgeCollectionId, CollectionProgress>
  oneTime: Record<OneTimeBadgeId, { earned: boolean; month?: string }>
  /** Ledger entries this evaluation found that aren't stored yet. */
  ledgerAdditions: string[]
  /** Every badge the data reaches today, with the month that reached it. */
  earned: { key: BadgeKey; month?: string }[]
}

const KEEPING_IN_TOUCH_LEDGER = 'keepingInTouch'

export const monthKeyOf = (year: number, monthIndex: number) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}`

const pad = (value: number) => String(value).padStart(2, '0')

/** Local calendar day and month of an instant, without moment's parsing cost. */
const localKeys = (date: Date) => {
  const month = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
  return { month, day: `${month}-${pad(date.getDate())}` }
}

const isMonthKey = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

/**
 * `YYYY-MM` months with at least one countable entry dated today or earlier. An
 * entry logged ahead of time counts once its day arrives, like a Plan.
 */
export const sharedMonths = (
  serviceReports: TimeEntriesByYear,
  today: string
): string[] => {
  const currentMonth = today.slice(0, 7)
  const months: string[] = []
  for (const [year, byMonth] of Object.entries(serviceReports ?? {})) {
    for (const [month, entries] of Object.entries(byMonth ?? {})) {
      const key = monthKeyOf(Number(year), Number(month))
      if (!isMonthKey(key) || key > currentMonth) continue
      const counts =
        key < currentMonth
          ? entries?.some(isCountableEntry)
          : entries?.some(
              (entry) =>
                isCountableEntry(entry) && storedDayKey(entry.date) <= today
            )
      if (counts) months.push(key)
    }
  }
  return months.sort()
}

/** The Service Year a `YYYY-MM` belongs to (September starts it). */
const serviceYearOfMonth = (month: string) => {
  const year = Number(month.slice(0, 4))
  return Number(month.slice(5, 7)) >= 9 ? year : year - 1
}

/**
 * Service Years with at least `YEAR_ROUND_MONTHS` shared months, each with the
 * month that got it there, oldest first.
 */
const yearRoundYears = (months: readonly string[]): string[] => {
  const byYear = new Map<number, string[]>()
  for (const month of months) {
    const year = serviceYearOfMonth(month)
    byYear.set(year, [...(byYear.get(year) ?? []), month])
  }
  return [...byYear.entries()]
    .filter(([, list]) => list.length >= YEAR_ROUND_MONTHS)
    .sort(([a], [b]) => a - b)
    .map(([, list]) => list.sort()[YEAR_ROUND_MONTHS - 1])
}

/**
 * Per Recurring Plan, the months it had a planned occurrence in, memoized on
 * the Plan and today's date so a long-running pattern is walked once a day.
 */
const recurringMonthsCache = new Map<
  string,
  { stamp: string; months: string[] }
>()

const recurringPlanMonths = (plan: RecurringPlan, today: string): string[] => {
  const stamp = JSON.stringify([
    plan.updatedAt,
    today,
    plan.startDate,
    plan.minutes,
    plan.recurrence,
    plan.deletedDates,
    plan.overrides,
  ])
  const cached = recurringMonthsCache.get(plan.id)
  if (cached?.stamp === stamp) return cached.months

  const skipped = new Set((plan.deletedDates ?? []).map(storedDayKey))
  const overrides = new Map(
    (plan.overrides ?? []).map((o) => [storedDayKey(o.date), o.minutes])
  )
  // Pattern matching only; skipped days and overrides are checked above.
  const pattern: RecurringPlan = { ...plan, deletedDates: [], overrides: [] }
  const plannedOn = (day: moment.Moment) => {
    const key = day.format('YYYY-MM-DD')
    if (skipped.has(key)) return false
    return (overrides.get(key) ?? plan.minutes) > 0
  }

  const months: string[] = []
  const start = moment.utc(storedDayKey(plan.startDate))
  const endKey = plan.recurrence.endDate
    ? storedDayKey(plan.recurrence.endDate)
    : today
  const last = moment.utc(endKey < today ? endKey : today)
  const { frequency, interval } = plan.recurrence
  const stepDays =
    frequency === RecurringPlanFrequencies.WEEKLY
      ? Math.max(1, interval) * 7
      : frequency === RecurringPlanFrequencies.BI_WEEKLY
        ? Math.max(1, interval) * 14
        : null

  const month = start.clone().startOf('month')
  while (month.isSameOrBefore(last, 'day')) {
    const monthEnd = month.clone().endOf('month').startOf('day')
    const to = monthEnd.isBefore(last) ? monthEnd : last
    const from = month.isBefore(start) ? start : month
    let found = false
    if (stepDays !== null) {
      // Occurrences fall on start + k × step.
      const k = Math.ceil(from.diff(start, 'days') / stepDays)
      const day = start.clone().add(k * stepDays, 'days')
      while (!found && day.isSameOrBefore(to, 'day')) {
        found = plannedOn(day)
        day.add(stepDays, 'days')
      }
    } else if (frequency === RecurringPlanFrequencies.MONTHLY) {
      const day = month.clone().date(start.date())
      found =
        day.month() === month.month() &&
        day.isSameOrAfter(from, 'day') &&
        day.isSameOrBefore(to, 'day') &&
        plannedOn(day)
    } else {
      const day = from.clone()
      while (!found && day.isSameOrBefore(to, 'day')) {
        const local = new Date(day.year(), day.month(), day.date(), 12)
        found =
          getPlansIntersectingDay(local, [pattern]).length > 0 && plannedOn(day)
        day.add(1, 'day')
      }
    }
    if (found) months.push(month.format('YYYY-MM'))
    month.add(1, 'month')
  }
  recurringMonthsCache.set(plan.id, { stamp, months })
  return months
}

/** Months, up to today, with a planned occurrence of any Plan. */
const preparedMonths = (
  dayPlans: readonly DayPlan[],
  recurringPlans: readonly RecurringPlan[],
  today: string
): string[] => {
  const months = new Set<string>()
  for (const plan of dayPlans) {
    if (!(plan.minutes > 0)) continue
    const day = storedDayKey(plan.date)
    if (day <= today) months.add(day.slice(0, 7))
  }
  for (const plan of recurringPlans) {
    for (const month of recurringPlanMonths(plan, today)) months.add(month)
  }
  return [...months].sort()
}

type VisitMonths = {
  conversations: string[]
  returnVisits: string[]
  nextTime: string[]
  /** Per Contact, the distinct months with a real conversation. */
  monthsPerContact: string[][]
  firstStudyMonth?: string
}

const visitMonths = (visits: readonly Visit[], now: Date): VisitMonths => {
  const conversations = new Set<string>()
  const returnVisits = new Set<string>()
  const nextTime = new Set<string>()
  const byContact = new Map<
    string,
    { day: string; month: string; talked: boolean }[]
  >()
  let firstStudy: { at: number; month: string } | undefined
  const nowMs = now.getTime()

  for (const visit of visits) {
    const date = new Date(visit.date)
    const at = date.getTime()
    if (!Number.isFinite(at) || at > nowMs) continue
    const { day, month } = localKeys(date)
    const talked = visit.notAtHome !== true
    if (talked) {
      conversations.add(month)
      if (visit.isBibleStudy && (!firstStudy || at < firstStudy.at))
        firstStudy = { at, month }
    }
    const followUp = visit.followUp
    if (followUp && !followUp.dismissed && followUp.topic?.trim())
      nextTime.add(month)
    const list = byContact.get(visit.contact.id) ?? []
    list.push({ day, month, talked })
    byContact.set(visit.contact.id, list)
  }

  const monthsPerContact: string[][] = []
  for (const list of byContact.values()) {
    let firstDay = list[0].day
    for (const item of list) if (item.day < firstDay) firstDay = item.day
    const talkedMonths = new Set<string>()
    for (const item of list) {
      if (item.day > firstDay) returnVisits.add(item.month)
      if (item.talked) talkedMonths.add(item.month)
    }
    monthsPerContact.push([...talkedMonths].sort())
  }

  return {
    conversations: [...conversations].sort(),
    returnVisits: [...returnVisits].sort(),
    nextTime: [...nextTime].sort(),
    monthsPerContact,
    firstStudyMonth: firstStudy?.month,
  }
}

const ledgerMonths = (ledger: readonly string[], id: BadgeCollectionId) => {
  const prefix = `${id}:`
  return ledger
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => entry.slice(prefix.length))
    .filter(isMonthKey)
}

const levelFor = (
  thresholds: BadgeCollectionSpec['thresholds'],
  count: number
): BadgeLevel | 0 => {
  let level: BadgeLevel | 0 = 0
  for (const candidate of BADGE_LEVELS) {
    if (count >= thresholds[candidate - 1]) level = candidate
  }
  return level
}

const progressFrom = (
  spec: BadgeCollectionSpec,
  count: number,
  reachedAt: (threshold: number) => string | undefined
): CollectionProgress => {
  const level = levelFor(spec.thresholds, count)
  return {
    id: spec.id,
    count,
    level,
    next: level === 4 ? null : spec.thresholds[level],
    reachedMonths: spec.thresholds
      .slice(0, level)
      .map((threshold) => reachedAt(threshold)),
  }
}

/**
 * Works out every badge the User's records reach. Pure: callers pass in the
 * store snapshots, and decide what to store and celebrate with
 * `newlyEarnedBadges`.
 */
export const evaluateBadges = (
  input: BadgeEvaluationInput
): BadgeEvaluation => {
  const today = moment(input.now).format('YYYY-MM-DD')
  const currentMonth = today.slice(0, 7)
  const ledger = new Set(input.ledger)
  const ledgerAdditions: string[] = []

  const shared = sharedMonths(input.serviceReports, today)
  const visits = visitMonths(input.visits, input.now)

  const liveMonths: Partial<Record<BadgeCollectionId, readonly string[]>> = {
    monthsShared: shared,
    reportSent: input.submittedReportMonths.filter(
      (month) => isMonthKey(month) && month <= currentMonth
    ),
    prepared: preparedMonths(input.dayPlans, input.recurringPlans, today),
    conversations: visits.conversations,
    returnVisits: visits.returnVisits,
    nextTime: visits.nextTime,
    together: input.togetherMonths.filter(
      (month) => isMonthKey(month) && month <= currentMonth
    ),
  }

  const collections = {} as Record<BadgeCollectionId, CollectionProgress>
  for (const spec of BADGE_COLLECTIONS) {
    if (spec.id === 'yearRound') {
      const years = yearRoundYears(shared)
      collections.yearRound = progressFrom(
        spec,
        years.length,
        (threshold) => years[threshold - 1]
      )
      continue
    }

    if (spec.id === 'keepingInTouch') {
      const perContact = visits.monthsPerContact
      const liveBest = Math.max(0, ...perContact.map((list) => list.length))
      const storedBest = Math.max(
        0,
        ...input.ledger
          .filter((entry) => entry.startsWith(`${KEEPING_IN_TOUCH_LEDGER}:`))
          .map((entry) =>
            Number(entry.slice(KEEPING_IN_TOUCH_LEDGER.length + 1))
          )
          .filter(Number.isFinite)
      )
      if (liveBest > storedBest)
        ledgerAdditions.push(`${KEEPING_IN_TOUCH_LEDGER}:${liveBest}`)
      collections.keepingInTouch = progressFrom(
        spec,
        Math.max(liveBest, storedBest),
        (threshold) =>
          perContact
            .filter((list) => list.length >= threshold)
            .map((list) => list[threshold - 1])
            .sort()[0]
      )
      continue
    }

    const live = liveMonths[spec.id] ?? []
    let months = live
    if (spec.ledger) {
      for (const month of live) {
        const entry = `${spec.id}:${month}`
        if (!ledger.has(entry)) ledgerAdditions.push(entry)
      }
      months = [...new Set([...live, ...ledgerMonths(input.ledger, spec.id)])]
    }
    const sorted = [...months].sort()
    collections[spec.id] = progressFrom(
      spec,
      sorted.length,
      (threshold) => sorted[threshold - 1]
    )
  }

  const oneTime: BadgeEvaluation['oneTime'] = {
    firstBibleStudy: visits.firstStudyMonth
      ? { earned: true, month: visits.firstStudyMonth }
      : { earned: false },
    firstBuddy: input.hasActiveBuddy
      ? { earned: true, month: currentMonth }
      : { earned: false },
  }

  const earned: BadgeEvaluation['earned'] = []
  for (const spec of BADGE_COLLECTIONS) {
    const progress = collections[spec.id]
    for (let level = 1; level <= progress.level; level++) {
      earned.push({
        key: badgeKey(spec.id, level as BadgeLevel),
        month: progress.reachedMonths[level - 1],
      })
    }
  }
  for (const [id, state] of Object.entries(oneTime)) {
    if (state.earned)
      earned.push({ key: badgeKey(id as OneTimeBadgeId), month: state.month })
  }

  return { collections, oneTime, ledgerAdditions, earned }
}

/**
 * More new badges than this from one evaluation means records arrived in bulk,
 * so they're filed as history instead of celebrated one by one.
 */
export const MAX_LIVE_AT_ONCE = 4

/** `YYYY-MM` of the month before `now`. */
const previousMonthKey = (now: Date) =>
  moment(now).subtract(1, 'month').format('YYYY-MM')

export type NewlyEarnedBadge = {
  key: BadgeKey
  record: EarnedBadge
  /**
   * Earned by something the User just did (this or last month), rather than
   * found in history. Only live badges are celebrated one by one and announced
   * to buddies.
   */
  live: boolean
}

/**
 * The badges an evaluation reaches that aren't stored yet. The first pass on a
 * device (`backfill`) and anything reached by an old month counts as history,
 * so restoring, importing, or upgrading never sets off a flood of
 * celebrations.
 */
export const newlyEarnedBadges = ({
  evaluation,
  stored,
  now,
  backfill,
}: {
  evaluation: BadgeEvaluation
  stored: Readonly<Record<string, EarnedBadge>>
  now: Date
  backfill: boolean
}): NewlyEarnedBadge[] => {
  const recent = previousMonthKey(now)
  const fresh = evaluation.earned.filter(({ key }) => !stored[key])
  const isRecent = (month: string | undefined) =>
    month !== undefined && month >= recent
  // A burst only comes from a bulk change (an import, a restore, a sync).
  const bulk =
    fresh.filter(({ month }) => isRecent(month)).length > MAX_LIVE_AT_ONCE
  return fresh.map(({ key, month }) => {
    const live = !backfill && !bulk && isRecent(month)
    return {
      key,
      live,
      record: {
        at: now.getTime(),
        ...(month ? { month } : {}),
        ...(live ? {} : { history: true }),
      },
    }
  })
}
