import moment from 'moment'
import { serviceYearMonthIndex } from '@/lib/serviceYear'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import type { PeriodTense } from '@/lib/projectedTotalCopy'
import type { ProjectedTotalMonth } from '@/lib/projectedTotal'

export type PacePoint = {
  x: number
  kind: 'start' | 'monthEnd' | 'today'

  monthIndex: number
  goal: number
  logged: number | null
  planned: number | null
  lastYear: number | null
}

export type PaceMonth = CalendarMonth & {
  goalMinutes: number

  loggedMinutes: number

  plannedMinutes: number
}

export type ServiceYearPace = {
  tense: PeriodTense
  months: PaceMonth[]
  points: PacePoint[]
  goalMinutes: number
  loggedMinutes: number
  projectedMinutes: number

  goalToDateMinutes: number

  lastYearToDateMinutes: number | null
  hasLastYear: boolean

  maxMinutes: number
}

export type ServiceYearPaceInput = {
  serviceYear: number
  today: Date

  goalMinutesByMonth: readonly number[]

  months: readonly ProjectedTotalMonth[]

  lastYearLoggedByMonth?: readonly number[] | null
}

const OVER_GOAL_BAND = 0.2

export type PaceScale = {
  toChart: (minutes: number) => number

  top: number

  compressed: boolean
}

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

  const todayIndex = serviceYearMonthIndex(
    { year: today.getFullYear(), month: today.getMonth() },
    serviceYear
  )
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
