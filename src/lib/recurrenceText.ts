import moment from 'moment'
import { formatDate } from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'
import { momentStoredDate, storedDateToLocalDate } from '@/lib/normalizeDate'
import { RecurringPlanFrequencies, type RecurringPlan } from '@/lib/recurrence'

const WEEK_OF_MONTH_KEYS: Record<number, TranslationKey> = {
  1: 'planRepeats_firstWeekday',
  2: 'planRepeats_secondWeekday',
  3: 'planRepeats_thirdWeekday',
  4: 'planRepeats_fourthWeekday',
  [-1]: 'planRepeats_lastWeekday',
}

/** How often a Recurring Plan happens, e.g. "Every Saturday". */
const describePattern = (plan: RecurringPlan): string => {
  const { frequency, interval, monthlyByWeekdayConfig } = plan.recurrence
  const start = momentStoredDate(plan.startDate)
  const weekday = moment.weekdays(start.day())
  switch (frequency) {
    case RecurringPlanFrequencies.WEEKLY:
    case RecurringPlanFrequencies.BI_WEEKLY: {
      const weeks =
        (frequency === RecurringPlanFrequencies.BI_WEEKLY ? 2 : 1) *
        Math.max(1, interval)
      if (weeks === 1) return i18n.t('planRepeats_weekly', { weekday })
      if (weeks === 2) return i18n.t('planRepeats_biWeekly', { weekday })
      return i18n.t('planRepeats_everyWeeks', { count: weeks, weekday })
    }
    case RecurringPlanFrequencies.MONTHLY:
      return i18n.t('planRepeats_monthly', {
        day: moment.localeData().ordinal(start.date()),
      })
    case RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY: {
      const config = monthlyByWeekdayConfig ?? {
        weekday: start.day(),
        weekOfMonth: 1,
      }
      return i18n.t(WEEK_OF_MONTH_KEYS[config.weekOfMonth], {
        weekday: moment.weekdays(config.weekday),
      })
    }
  }
}

/**
 * A Recurring Plan's pattern in words, with its last date when it has one:
 * "Every other Saturday until December 5, 2026".
 */
export function describeRecurrence(plan: RecurringPlan): string {
  const pattern = describePattern(plan)
  const { endDate } = plan.recurrence
  if (!endDate) return pattern
  return i18n.t('planRepeats_until', {
    pattern,
    date: formatDate(storedDateToLocalDate(endDate)),
  })
}
