import moment from 'moment'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { formatDisplay } from '@/lib/dates'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { calendarMonthOf } from '@/lib/roleHistory'
import { serviceYearOf } from '@/lib/serviceYear'
import type { MinuteDisplayFormat } from '@/types/timeEntry'

type TimeSavedProgressInput = {
  addedMinutes: number

  beforeMinutes: number
  afterMinutes: number

  goalMinutes: number

  period: 'month' | 'serviceYear'

  entryMonth: CalendarMonth

  today?: CalendarMonth
  format: MinuteDisplayFormat
}

const formatProgressMinutes = (minutes: number, format: MinuteDisplayFormat) =>
  formatMinutes(
    format === 'decimal' ? Math.floor(minutes / 6) * 6 : Math.floor(minutes),
    format
  ).formatted

const pastPeriodLabel = (
  period: TimeSavedProgressInput['period'],
  entryMonth: CalendarMonth,
  today: CalendarMonth
): string | null => {
  if (period === 'serviceYear') {
    const serviceYear = serviceYearOf(entryMonth)
    if (serviceYear === serviceYearOf(today)) return null
    return i18n.t('scheduleCalendar.serviceYearSpan', {
      start: serviceYear,
      end: serviceYear + 1,
    })
  }
  if (entryMonth.year === today.year && entryMonth.month === today.month) {
    return null
  }
  return formatDisplay(
    moment(entryMonth),
    entryMonth.year === today.year ? 'MMM' : 'MMM YYYY'
  )
}

export const timeSavedProgress = ({
  addedMinutes,
  beforeMinutes,
  afterMinutes,
  goalMinutes,
  period,
  entryMonth,
  today = calendarMonthOf(),
  format,
}: TimeSavedProgressInput): { added: string; progress: string } => {
  const added = i18n.t('timeSavedProgress.added', {
    value: formatMinutes(addedMinutes, format).formatted,
  })
  const pastPeriod = pastPeriodLabel(period, entryMonth, today)
  const value = formatProgressMinutes(afterMinutes, format)

  if (goalMinutes <= 0) {
    return {
      added,
      progress: pastPeriod
        ? i18n.t('timeSavedProgress.totalIn', { value, period: pastPeriod })
        : i18n.t('timeSavedProgress.totalThisMonth', { value }),
    }
  }
  if (beforeMinutes < goalMinutes && afterMinutes >= goalMinutes) {
    return {
      added,
      progress: i18n.t(
        period === 'serviceYear'
          ? 'timeSavedProgress.annualGoalReached'
          : 'timeSavedProgress.monthlyGoalReached'
      ),
    }
  }

  const goal: string = i18n.t('hoursShort', {
    count: Math.round((goalMinutes / 60) * 10) / 10,
  })
  return {
    added,
    progress: pastPeriod
      ? i18n.t('timeSavedProgress.ofGoalIn', {
          value,
          goal,
          period: pastPeriod,
        })
      : i18n.t('timeSavedProgress.ofGoal', { value, goal }),
  }
}
