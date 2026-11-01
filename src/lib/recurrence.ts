import moment from 'moment'
import {
  DayPlan,
  MonthlyByWeekdayConfig,
  RecurringPlan,
  RecurringPlanFrequencies,
  RecurringPlanOverride,
} from '@/types/timeEntry'
import { dayPlansOnLocalDay } from '@/lib/dayPlansByDay'
import { logger } from '@/lib/logger'
import { hasNote } from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'
import {
  DEFAULT_START_TIME_IN_MINUTES,
  isStoredDateAnchored,
  momentStoredDate,
  normalizeDateForStorage,
  storedDayKey,
} from '@/lib/normalizeDate'

export { RecurringPlanFrequencies }
export type { MonthlyByWeekdayConfig, RecurringPlan, RecurringPlanOverride }

const MS_PER_DAY = 86_400_000

const storedEpochDay = (date: Date | string): number =>
  Math.floor(momentStoredDate(date).valueOf() / MS_PER_DAY)

type CompiledRecurringPlan = {
  start: number

  end: number | null
  startDayOfMonth: number
  skipped: Set<number>
  overrides: Map<number, RecurringPlanOverride>
}

const compiledPlans = new WeakMap<RecurringPlan, CompiledRecurringPlan>()

const compileRecurringPlan = (plan: RecurringPlan): CompiledRecurringPlan => {
  const cached = compiledPlans.get(plan)
  if (cached) return cached

  const { startDate, recurrence } = plan
  const { endDate } = recurrence
  const deletedDates = plan.deletedDates ?? []
  const overrides = plan.overrides ?? []
  const compiled: CompiledRecurringPlan = {
    start: storedEpochDay(startDate),
    end: endDate ? storedEpochDay(endDate) : null,
    startDayOfMonth: momentStoredDate(startDate).date(),

    skipped: new Set(
      deletedDates.map(storedEpochDay).filter((day) => !Number.isNaN(day))
    ),
    overrides: new Map(),
  }

  for (const override of [...overrides].reverse()) {
    const day = storedEpochDay(override.date)
    if (!Number.isNaN(day)) compiled.overrides.set(day, override)
  }

  const anchored = [
    startDate,
    ...(endDate ? [endDate] : []),
    ...deletedDates,
    ...overrides.map((o) => o.date),
  ].every(isStoredDateAnchored)
  if (anchored) compiledPlans.set(plan, compiled)
  return compiled
}

const epochDayOf = (day: Date): number =>
  Math.floor(normalizeDateForStorage(day).getTime() / MS_PER_DAY)

const findOverrideForDay = (
  plan: RecurringPlan,
  date: Date
): RecurringPlanOverride | undefined =>
  compileRecurringPlan(plan).overrides.get(epochDayOf(date))

const doesDayMatchMonthlyByWeekday = (
  day: Date,
  config: MonthlyByWeekdayConfig
): boolean => {
  const momentDay = momentStoredDate(day)
  const dayWeekday = momentDay.day()

  if (dayWeekday !== config.weekday) {
    return false
  }

  const firstDayOfMonth = momentDay.clone().startOf('month')

  if (config.weekOfMonth === -1) {
    const lastDayOfMonth = momentDay.clone().endOf('month')
    const daysFromEnd = lastDayOfMonth.date() - momentDay.date()
    return daysFromEnd < 7 && dayWeekday === config.weekday
  } else {
    const firstWeekdayOfMonth = firstDayOfMonth.clone()
    while (firstWeekdayOfMonth.day() !== config.weekday) {
      firstWeekdayOfMonth.add(1, 'day')
    }

    const weeksBetween = momentDay.diff(firstWeekdayOfMonth, 'weeks')
    const occurrence = weeksBetween + 1

    return occurrence === config.weekOfMonth
  }
}

export const getPlansIntersectingDay = (
  day: Date,
  plans: RecurringPlan[]
): RecurringPlan[] => {
  const normalizedDay = normalizeDateForStorage(day)
  const dayNumber = Math.floor(normalizedDay.getTime() / MS_PER_DAY)

  return plans.filter((plan) => {
    const { recurrence } = plan
    const { frequency, interval } = recurrence
    const { start, end, startDayOfMonth, skipped } = compileRecurringPlan(plan)

    if (skipped.has(dayNumber)) return false

    const daysDiff = dayNumber - start
    const inRange = dayNumber >= start && (end === null || dayNumber <= end)

    switch (frequency) {
      case RecurringPlanFrequencies.WEEKLY:
        return daysDiff % (interval * 7) === 0 && inRange
      case RecurringPlanFrequencies.BI_WEEKLY:
        return daysDiff % (interval * 14) === 0 && inRange
      case RecurringPlanFrequencies.MONTHLY:
        return normalizedDay.getUTCDate() === startDayOfMonth && inRange
      case RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY:
        return (
          !!recurrence.monthlyByWeekdayConfig &&
          inRange &&
          doesDayMatchMonthlyByWeekday(
            normalizedDay,
            recurrence.monthlyByWeekdayConfig
          )
        )
      default:
        return false
    }
  })
}

export const getEffectiveMinutesForRecurringPlan = (
  plan: RecurringPlan,
  date: Date
): number => {
  const override = findOverrideForDay(plan, date)
  return override ? override.minutes : plan.minutes
}

export const getEffectiveNoteForRecurringPlan = (
  plan: RecurringPlan,
  date: Date
): NoteFields => {
  const override = findOverrideForDay(plan, date)
  const source = override && hasNote(override) ? override : plan
  return { note: source.note, noteDoc: source.noteDoc }
}

export const getSetStartTimeInMinutesForRecurringPlan = (
  plan: RecurringPlan,
  date: Date
): number | undefined =>
  findOverrideForDay(plan, date)?.startTimeInMinutes ?? plan.startTimeInMinutes

export const isRecurringPlanAnytimeOnDate = (
  plan: RecurringPlan,
  date: Date
): boolean => findOverrideForDay(plan, date)?.anytime ?? !!plan.anytime

export const getEffectiveStartTimeInMinutesForRecurringPlan = (
  plan: RecurringPlan,
  date: Date
): number => {
  const override = findOverrideForDay(plan, date)
  return (
    override?.startTimeInMinutes ??
    plan.startTimeInMinutes ??
    DEFAULT_START_TIME_IN_MINUTES
  )
}

type PlannedDayContributionFields = {
  minutes: number
  isCredit: boolean
}

export type PlannedDayContribution =
  | (PlannedDayContributionFields & {
      source: 'day'
      plan: DayPlan
    })
  | (PlannedDayContributionFields & {
      source: 'recurring'
      plan: RecurringPlan
    })

type PlannedDayResolutionOptions = {
  dayPlanIsCredit?: (plan: DayPlan) => boolean

  recurringIsCredit?: (plan: RecurringPlan) => boolean
}

export const resolvePlannedContributionsForDay = (
  day: Date,

  dayPlansForDay: DayPlan[],
  recurringPlans: RecurringPlan[],
  opts?: PlannedDayResolutionOptions
): PlannedDayContribution[] => [
  ...dayPlansForDay.map(
    (plan): PlannedDayContribution => ({
      source: 'day',
      plan,
      minutes: plan.minutes,
      isCredit: opts?.dayPlanIsCredit?.(plan) ?? false,
    })
  ),
  ...getPlansIntersectingDay(day, recurringPlans)
    .map(
      (plan): PlannedDayContribution => ({
        source: 'recurring',
        plan,
        minutes: getEffectiveMinutesForRecurringPlan(plan, day),
        isCredit: opts?.recurringIsCredit?.(plan) ?? false,
      })
    )
    .filter((contribution) => contribution.minutes >= 0),
]

export const plannedMinutesForDay = (
  day: Date,
  dayPlansForDay: DayPlan[],
  recurringPlans: RecurringPlan[]
): number =>
  resolvePlannedContributionsForDay(day, dayPlansForDay, recurringPlans).reduce(
    (acc, c) => acc + c.minutes,
    0
  )

const plannedMinutesOnMonthDay = (
  selectedMonth: moment.Moment,
  date: number,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): number => {
  const dayDate = selectedMonth.clone().date(date).toDate()
  return plannedMinutesForDay(
    dayDate,
    dayPlansOnLocalDay(dayPlans, dayDate),
    recurringPlans
  )
}

export const plannedMinutesThroughEachDayOfMonth = (
  month: number,
  year: number,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): number[] => {
  const selectedMonth = moment({ year, month, date: 1 }).startOf('month')
  let count = 0
  return Array.from({ length: selectedMonth.daysInMonth() }, (_, i) => {
    count += plannedMinutesOnMonthDay(
      selectedMonth,
      i + 1,
      dayPlans,
      recurringPlans
    )
    return count
  })
}

export const plannedMinutesThroughDayForMonth = (
  month: number,
  year: number,
  throughDay: number,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
) => {
  const selectedMonth = moment({ year, month, date: 1 }).startOf('month')
  const dayOfMonth = Math.max(
    0,
    Math.min(throughDay, selectedMonth.daysInMonth())
  )

  let count = 0

  Array(dayOfMonth)
    .fill(1)
    .forEach((_, i) => {
      count += plannedMinutesOnMonthDay(
        selectedMonth,
        i + 1,
        dayPlans,
        recurringPlans
      )
    })

  return count
}

export const precomputeRecurringPlansForRange = (
  recurringPlans: RecurringPlan[],
  minDate: moment.Moment,
  maxDate: moment.Moment
): Map<string, { plan: RecurringPlan; effectiveMinutes: number }[]> => {
  const perfStart = performance.now()
  const cache = new Map<
    string,
    { plan: RecurringPlan; effectiveMinutes: number }[]
  >()

  logger.log(
    `[precomputeRecurringPlans] Starting pre-computation for ${recurringPlans.length} plans from ${minDate.format('YYYY-MM-DD')} to ${maxDate.format('YYYY-MM-DD')}`
  )

  recurringPlans.forEach((plan) => {
    const current = minDate.clone()

    while (current.isSameOrBefore(maxDate)) {
      const currentDate = current.toDate()
      const plansForDay = getPlansIntersectingDay(currentDate, [plan])

      if (plansForDay.length > 0) {
        const key = current.format('YYYY-MM-DD')
        const existing = cache.get(key) || []
        existing.push({
          plan,
          effectiveMinutes: getEffectiveMinutesForRecurringPlan(
            plan,
            currentDate
          ),
        })
        cache.set(key, existing)
      }

      current.add(1, 'd')
    }
  })

  logger.log(
    `[precomputeRecurringPlans] Completed in ${(performance.now() - perfStart).toFixed(2)}ms - cached ${cache.size} unique dates`
  )

  return cache
}

export const calculateMonthlyPlannedMinutesOptimized = (
  month: number,
  year: number,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): number => {
  const perfStart = performance.now()
  const selectedMonth = moment().month(month).year(year)
  const dayOfMonth = selectedMonth.daysInMonth()

  logger.log(
    `[calculateMonthlyOptimized] Calculating for ${selectedMonth.format('MMMM YYYY')} with ${dayPlans.length} day plans and ${recurringPlans.length} recurring plans`
  )

  const dayPlanMap = new Map<string, DayPlan[]>()
  dayPlans.forEach((p) => {
    const key = momentStoredDate(p.date).format('YYYY-MM-DD')
    const existing = dayPlanMap.get(key)
    if (existing) existing.push(p)
    else dayPlanMap.set(key, [p])
  })
  logger.log(
    `[calculateMonthlyOptimized] Created day plan map with ${dayPlanMap.size} entries`
  )

  const minDate = selectedMonth.clone().startOf('month')
  const maxDate = selectedMonth.clone().endOf('month')
  const recurringPlanCache = precomputeRecurringPlansForRange(
    recurringPlans,
    minDate,
    maxDate
  )

  let count = 0

  for (let i = 0; i < dayOfMonth; i++) {
    const day = selectedMonth.clone().date(i + 1)
    const dayKey = day.format('YYYY-MM-DD')

    const dayPlansForDay = dayPlanMap.get(dayKey) ?? []
    const recurringPlansForDay = recurringPlanCache.get(dayKey) ?? []

    count += dayPlansForDay.reduce((acc, p) => acc + p.minutes, 0)
    count += recurringPlansForDay.reduce(
      (acc, p) => acc + Math.max(0, p.effectiveMinutes),
      0
    )
  }

  logger.log(
    `[calculateMonthlyOptimized] Completed in ${(performance.now() - perfStart).toFixed(2)}ms - total minutes: ${count}`
  )

  return count
}

export const skipRecurringInstancesOnDayPlanDates = (
  dayPlans: Pick<DayPlan, 'date'>[],
  recurringPlans: RecurringPlan[],
  stamp?: (previous?: number) => number
): RecurringPlan[] => {
  const days = [
    ...new Set(dayPlans.map((plan) => storedDayKey(plan.date))),
  ].map((key) => {
    const [year, month, date] = key.split('-').map(Number)
    return new Date(year, month - 1, date, 12)
  })
  return recurringPlans.map((plan) => {
    const skipped = days.filter(
      (day) => getPlansIntersectingDay(day, [plan]).length > 0
    )
    if (!skipped.length) return plan
    return {
      ...plan,
      deletedDates: [
        ...(plan.deletedDates ?? []),
        ...skipped.map(normalizeDateForStorage),
      ],
      ...(stamp ? { updatedAt: stamp(plan.updatedAt) } : {}),
    }
  })
}
