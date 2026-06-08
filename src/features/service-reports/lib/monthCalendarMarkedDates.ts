import moment from 'moment'

import {
  getEffectiveMinutesForRecurringPlan,
  getEffectiveNoteForRecurringPlan,
  getEffectiveStartTimeInMinutesForRecurringPlan,
  getPlansIntersectingDay,
} from '@/lib/serviceReport'
import { momentStoredDate } from '@/lib/normalizeDate'
import type { DayPlan, TimeEntry } from '@/types/timeEntry'
import type { RecurringPlan } from '@/lib/serviceReport'

export type MonthCalendarMarkedDates = Record<
  string,
  {
    marked?: boolean
    dotColor?: string
    /**
     * Non-visual marker. `react-native-calendars` deep-compares each day's
     * marking prop before rerendering a custom day component.
     */
    planInvalidationKey?: string
  }
>

type BuildMonthCalendarMarkedDatesArgs = {
  month: number
  year: number
  monthsReports: TimeEntry[] | null
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  reportDotColor: string
}

export const buildMonthCalendarMarkedDates = ({
  month,
  year,
  monthsReports,
  dayPlans,
  recurringPlans,
  reportDotColor,
}: BuildMonthCalendarMarkedDatesArgs): MonthCalendarMarkedDates => {
  const markedDates: MonthCalendarMarkedDates = {}
  const planFingerprintsByDate = new Map<string, string[]>()

  monthsReports?.forEach((report) => {
    const dateKey = momentStoredDate(report.date).format('YYYY-MM-DD')
    markedDates[dateKey] = { marked: true, dotColor: reportDotColor }
  })

  dayPlans.forEach((plan) => {
    const planDate = momentStoredDate(plan.date)
    if (planDate.month() !== month || planDate.year() !== year) return

    const dateKey = planDate.format('YYYY-MM-DD')
    const fingerprints = planFingerprintsByDate.get(dateKey) ?? []
    fingerprints.push(
      [
        'd',
        plan.id,
        plan.updatedAt ?? 'none',
        plan.minutes,
        plan.startTimeInMinutes ?? 'none',
        plan.note ?? '',
      ].join(':')
    )
    planFingerprintsByDate.set(dateKey, fingerprints)
  })

  const monthStart = moment([year, month, 1])
  const daysInMonth = monthStart.daysInMonth()
  for (let day = 1; day <= daysInMonth; day++) {
    const date = monthStart.clone().date(day)
    const dateKey = date.format('YYYY-MM-DD')
    const recurringPlansForDay = getPlansIntersectingDay(
      date.toDate(),
      recurringPlans
    )
    if (recurringPlansForDay.length === 0) continue

    const fingerprints = planFingerprintsByDate.get(dateKey) ?? []
    recurringPlansForDay.forEach((plan) => {
      fingerprints.push(
        [
          'r',
          plan.id,
          plan.updatedAt ?? 'none',
          getEffectiveMinutesForRecurringPlan(plan, date.toDate()),
          getEffectiveStartTimeInMinutesForRecurringPlan(plan, date.toDate()),
          getEffectiveNoteForRecurringPlan(plan, date.toDate()) ?? '',
        ].join(':')
      )
    })
    planFingerprintsByDate.set(dateKey, fingerprints)
  }

  planFingerprintsByDate.forEach((fingerprints, dateKey) => {
    markedDates[dateKey] = {
      ...markedDates[dateKey],
      planInvalidationKey: fingerprints.sort().join('|'),
    }
  })

  return markedDates
}
