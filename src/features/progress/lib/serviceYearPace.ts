import moment from 'moment'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import type { PeriodTense } from '@/lib/projectedTotalCopy'
import type { ProjectedTotalMonth } from '@/lib/projectedTotal'

/**
 * One point on the Service Year pace chart. `x` counts months from September 1:
 * `0` is the start of the year, `k` the end of its k-th month, and a fractional
 * value is today. Values are running totals in minutes; `null` leaves the line
 * out at that point.
 */
export type PacePoint = {
  x: number
  kind: 'start' | 'monthEnd' | 'today'
  /** The Service Year month (0 = September) the point closes or falls in. */
  monthIndex: number
  goal: number
  logged: number | null
  planned: number | null
  lastYear: number | null
}

export type PaceMonth = CalendarMonth & {
  /** This month's share of the Annual Goal. */
  goalMinutes: number
  /** Logged minutes after the month's credit cap — what its report counts. */
  loggedMinutes: number
  /** What remaining Plans add to the month after its credit cap. */
  plannedMinutes: number
}

export type ServiceYearPace = {
  tense: PeriodTense
  months: PaceMonth[]
  points: PacePoint[]
  goalMinutes: number
  loggedMinutes: number
  projectedMinutes: number
  /**
   * Where the running goal stands now: up to today while the year runs, the
   * whole goal once it's over, nothing before it starts.
   */
  goalToDateMinutes: number
  /** Last year's running total at the same point, when last year has time. */
  lastYearToDateMinutes: number | null
  hasLastYear: boolean
  /** The largest value any line reaches. */
  maxMinutes: number
}

export type ServiceYearPaceInput = {
  /** Start year of the Service Year (September of `serviceYear`). */
  serviceYear: number
  today: Date
  /** Each month's share of the Annual Goal in minutes, September first. */
  goalMinutesByMonth: readonly number[]
  /** The year's months from `computeProjectedTotal`, September first. */
  months: readonly ProjectedTotalMonth[]
  /** Last Service Year's capped logged minutes per month, September first. */
  lastYearLoggedByMonth?: readonly number[] | null
}

/** Share of the chart's height the band above the goal takes once compressed. */
const OVER_GOAL_BAND = 0.2

export type PaceScale = {
  /** Maps a running total in minutes to chart units. */
  toChart: (minutes: number) => number
  /** Chart units at the highest total. */
  top: number
  /** Totals above the goal are drawn on a log scale. */
  compressed: boolean
}

/**
 * The pace chart's vertical scale: linear up to the goal, so the months that
 * matter keep their true proportions, then logarithmic above it once a line
 * runs far past the goal — a 900-hour year can't squash the rest of the chart.
 * Totals only a little over the goal stay linear; the log band would stretch
 * them instead.
 */
export const paceScale = (
  goalMinutes: number,
  maxMinutes: number
): PaceScale => {
  const band = goalMinutes * (OVER_GOAL_BAND / (1 - OVER_GOAL_BAND))
  if (goalMinutes <= 0 || maxMinutes - goalMinutes <= band) {
    return {
      toChart: (minutes) => minutes,
      top: Math.max(maxMinutes, goalMinutes),
      compressed: false,
    }
  }
  const span = Math.log(maxMinutes / goalMinutes)
  return {
    toChart: (minutes) =>
      minutes <= goalMinutes
        ? minutes
        : goalMinutes + (band * Math.log(minutes / goalMinutes)) / span,
    top: goalMinutes + band,
    compressed: true,
  }
}

const runningTotals = (values: readonly number[]): number[] => {
  const totals = [0]
  for (const value of values) totals.push(totals[totals.length - 1] + value)
  return totals
}

/**
 * Builds the Service Year pace series: the running goal, logged time up to
 * today, Plans from today on, and last year's running total for comparison.
 * Today sits mid-day within its month so it never lands on a month boundary.
 */
export const buildServiceYearPace = ({
  serviceYear,
  today,
  goalMinutesByMonth,
  months: projectedMonths,
  lastYearLoggedByMonth,
}: ServiceYearPaceInput): ServiceYearPace => {
  const months: PaceMonth[] = projectedMonths.map((m, i) => ({
    year: m.year,
    month: m.month,
    goalMinutes: goalMinutesByMonth[i] ?? 0,
    loggedMinutes: m.loggedMinutes,
    plannedMinutes: Math.max(0, m.projectedMinutes - m.loggedMinutes),
  }))

  const todayIndex =
    today.getFullYear() * 12 + today.getMonth() - (serviceYear * 12 + 8)
  const tense: PeriodTense =
    todayIndex < 0 ? 'future' : todayIndex > 11 ? 'past' : 'present'
  const dayFraction =
    tense === 'present'
      ? (today.getDate() - 0.5) / moment(today).daysInMonth()
      : 0

  const goalTotals = runningTotals(months.map((m) => m.goalMinutes))
  const loggedTotals = runningTotals(months.map((m) => m.loggedMinutes))
  const projectedTotals = runningTotals(
    months.map((m) => m.loggedMinutes + m.plannedMinutes)
  )
  const lastYearMonths = lastYearLoggedByMonth ?? []
  const hasLastYear = lastYearMonths.some((minutes) => minutes > 0)
  const lastYearTotals = runningTotals(
    months.map((_, i) => lastYearMonths[i] ?? 0)
  )

  const hasPlanned = months.some((m) => m.plannedMinutes > 0)
  const points: PacePoint[] = []
  for (let k = 0; k <= 12; k++) {
    const isLoggedPoint =
      tense === 'past' || (tense === 'present' && k <= todayIndex)
    const isPlannedPoint =
      hasPlanned &&
      (tense === 'future' || (tense === 'present' && k > todayIndex))
    points.push({
      x: k,
      kind: k === 0 ? 'start' : 'monthEnd',
      monthIndex: Math.max(0, k - 1),
      goal: goalTotals[k],
      logged: isLoggedPoint ? loggedTotals[k] : null,
      planned: isPlannedPoint ? projectedTotals[k] : null,
      lastYear: hasLastYear ? lastYearTotals[k] : null,
    })

    if (tense === 'present' && k === todayIndex) {
      const loggedSoFar = loggedTotals[k] + months[k].loggedMinutes
      points.push({
        x: k + dayFraction,
        kind: 'today',
        monthIndex: k,
        goal: goalTotals[k] + months[k].goalMinutes * dayFraction,
        logged: loggedSoFar,
        planned: hasPlanned ? loggedSoFar : null,
        lastYear: hasLastYear
          ? lastYearTotals[k] + (lastYearMonths[k] ?? 0) * dayFraction
          : null,
      })
    }
  }

  const todayPoint = points.find((p) => p.kind === 'today')
  const goalToDateMinutes =
    tense === 'past' ? goalTotals[12] : (todayPoint?.goal ?? 0)
  const lastYearToDateMinutes = !hasLastYear
    ? null
    : tense === 'past'
      ? lastYearTotals[12]
      : (todayPoint?.lastYear ?? null)

  const maxMinutes = Math.max(
    0,
    ...points.flatMap((p) => [
      p.goal,
      p.logged ?? 0,
      p.planned ?? 0,
      p.lastYear ?? 0,
    ])
  )

  return {
    tense,
    months,
    points,
    goalMinutes: goalTotals[12],
    loggedMinutes: loggedTotals[12],
    projectedMinutes: projectedTotals[12],
    goalToDateMinutes,
    lastYearToDateMinutes,
    hasLastYear,
    maxMinutes,
  }
}
