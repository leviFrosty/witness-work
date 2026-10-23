import moment from 'moment'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { formatDisplay } from '@/lib/dates'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { calendarMonthOf } from '@/lib/roleHistory'
import { serviceYearOf } from '@/lib/serviceYear'
import type { MinuteDisplayFormat } from '@/types/timeEntry'

type TimeSavedProgressInput = {
  /** The new entry's length. */
  addedMinutes: number
  /** The period's credit-capped total before and after the save. */
  beforeMinutes: number
  afterMinutes: number
  /** The period's goal; 0 when the User has none. */
  goalMinutes: number
  /** The month for a monthly goal (or none), the Service Year for an annual one. */
  period: 'month' | 'serviceYear'
  /** The month the entry was logged in. */
  entryMonth: CalendarMonth
  /** This month, which the confirmation doesn't need to name. */
  today?: CalendarMonth
  format: MinuteDisplayFormat
}

/**
 * A total rounded down to what the format shows (a tenth of an hour, or a
 * minute), so a goal never reads as met before it is.
 */
const formatProgressMinutes = (minutes: number, format: MinuteDisplayFormat) =>
  formatMinutes(
    format === 'decimal' ? Math.floor(minutes / 6) * 6 : Math.floor(minutes),
    format
  ).formatted

/** The entry's period when it isn't the current one, e.g. "Sep" or "2025–2026". */
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

/**
 * What a saved Time Entry did to the User's progress, for its confirmation:
 * `added` ("1h 30m added") and `progress` ("12h 15m of 50h", "Monthly goal
 * reached" when the save crosses the goal, or "12h 15m this month" with no
 * goal). An entry for an earlier month or Service Year names it ("… in Sep"). A
 * toast line is short, so the current period goes unnamed.
 */
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
  // A goal the User set in hours, e.g. "50h".
  // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
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
