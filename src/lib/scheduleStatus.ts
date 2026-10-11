import moment from 'moment'

import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { plannedMinutesThroughDayForMonth } from '@/lib/recurrence'
import { momentStoredDate, normalizeDateForStorage } from '@/lib/normalizeDate'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { serviceYearMonths } from '@/lib/roleHistory'
import type { Publisher } from '@/types/publisher'
import type {
  DayPlan,
  RecurringPlan,
  TimeEntriesByYear,
} from '@/types/timeEntry'

export type ScheduleStatusState =
  | 'ahead'
  | 'behind'
  | 'onTrack'
  | 'noPlan'
  | 'notStarted'

export type ScheduleStatus = {
  state: ScheduleStatusState
  actualMinutes: number
  plannedMinutes: number
  differenceMinutes: number
  throughDay: number
}

type ScheduleStatusInput = {
  month: number
  year: number
  today?: Date
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  publisher: Publisher
  creditLimit: {
    enabled: boolean
    customLimitHours: number
  }
}

/**
 * Compares logged progress with planned schedule progress for a selected month.
 * Current months are evaluated through today (inclusive), so today's Time
 * Entries immediately move the schedule status. Past and future months use the
 * full month; future months remain not-started but still show planned time.
 */
export const getScheduleStatusForMonth = ({
  month,
  year,
  today = new Date(),
  serviceReports,
  dayPlans,
  recurringPlans,
  publisher,
  creditLimit,
}: ScheduleStatusInput): ScheduleStatus => {
  const todayMoment = moment(today)
  const selectedMonth = moment({ year, month, date: 1 }).startOf('month')

  const isFutureMonth = selectedMonth.isAfter(todayMoment, 'month')
  const isCurrentMonth = selectedMonth.isSame(todayMoment, 'month')
  const throughDay = isCurrentMonth
    ? todayMoment.date()
    : selectedMonth.daysInMonth()

  const plannedMinutes = plannedMinutesThroughDayForMonth(
    month,
    year,
    throughDay,
    dayPlans,
    recurringPlans
  )

  const throughDate = momentStoredDate(
    normalizeDateForStorage(
      selectedMonth.clone().date(Math.max(throughDay, 1)).toDate()
    )
  )
  const reportsThroughDay = getMonthsReports(
    serviceReports,
    month,
    year
  ).filter((report) =>
    momentStoredDate(report.date).isSameOrBefore(throughDate, 'day')
  )

  const actualMinutes = isFutureMonth
    ? 0
    : adjustedMinutesForSpecificMonth(
        reportsThroughDay,
        month,
        year,
        publisher,
        {
          enabled: creditLimit.enabled,
          customLimitHours: creditLimit.customLimitHours,
        }
      ).value

  const differenceMinutes = actualMinutes - plannedMinutes

  const state: ScheduleStatusState = (() => {
    if (isFutureMonth) return 'notStarted'
    if (plannedMinutes === 0 && actualMinutes === 0) return 'noPlan'
    if (differenceMinutes > 0) return 'ahead'
    if (differenceMinutes < 0) return 'behind'
    return 'onTrack'
  })()

  return {
    state,
    actualMinutes,
    plannedMinutes,
    differenceMinutes,
    throughDay,
  }
}

/**
 * A Service Year's schedule status: its months' statuses through today, added
 * up, each month's Credit Time capped by the role that applied then. Months
 * still to come add nothing, and a year before its September hasn't started.
 */
export const getScheduleStatusForServiceYear = ({
  serviceYear,
  publisherForMonth,
  today = new Date(),
  ...input
}: Omit<ScheduleStatusInput, 'month' | 'year' | 'publisher'> & {
  serviceYear: number
  publisherForMonth: (month: CalendarMonth) => Publisher
}): ScheduleStatus => {
  const started = serviceYearMonths(serviceYear)
    .map((target) =>
      getScheduleStatusForMonth({
        ...input,
        ...target,
        today,
        publisher: publisherForMonth(target),
      })
    )
    .filter((status) => status.state !== 'notStarted')
  const actualMinutes = started.reduce((sum, s) => sum + s.actualMinutes, 0)
  const plannedMinutes = started.reduce((sum, s) => sum + s.plannedMinutes, 0)
  const differenceMinutes = actualMinutes - plannedMinutes

  const state: ScheduleStatusState = (() => {
    if (!started.length) return 'notStarted'
    if (plannedMinutes === 0 && actualMinutes === 0) return 'noPlan'
    if (differenceMinutes > 0) return 'ahead'
    if (differenceMinutes < 0) return 'behind'
    return 'onTrack'
  })()

  return {
    state,
    actualMinutes,
    plannedMinutes,
    differenceMinutes,
    throughDay: started.at(-1)?.throughDay ?? 0,
  }
}
