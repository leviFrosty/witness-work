import { View } from 'react-native'

import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatDate, formatStartTime } from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { getStartTimeInMinutes } from '@/lib/normalizeDate'
import {
  getEffectiveMinutesForRecurringPlan,
  getEffectiveNoteForRecurringPlan,
  getEffectiveStartTimeInMinutesForRecurringPlan,
  isRecurringPlanAnytimeOnDate,
  type RecurringPlan,
} from '@/lib/recurrence'
import { getCategoryLabel, isLdcEntry } from '@/lib/serviceReportCategory'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import type { DayPlan, TimeEntry } from '@/types/timeEntry'

type Props = {
  /** Local day. */
  date: Date
  reports: TimeEntry[]
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}

type Line = { key: string; primary: string; secondary?: string }

/** True when a day has anything for `DayPreview` to show. */
export const dayHasPreview = (props: Omit<Props, 'date'>) =>
  props.reports.length > 0 ||
  props.dayPlans.length > 0 ||
  props.recurringPlans.length > 0

/**
 * Read-only summary of one day — its Time Entries and Plans — shown above a
 * calendar day's context menu, where the day itself is only a small square.
 */
export default function DayPreview({
  date,
  reports,
  dayPlans,
  recurringPlans,
}: Props) {
  const theme = useTheme()
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const categories = useCategories((s) => s.categories)
  const duration = (minutes: number) =>
    formatMinutes(minutes, timeDisplayFormat).formatted

  const reportLines: Line[] = reports.map((report) => {
    const minutes = report.hours * 60 + report.minutes
    const categoryName = getCategoryLabel(report, categories)
    const type = report.rollover
      ? i18n.t('timeRollover_rowLabel')
      : isLdcEntry(report)
        ? i18n.t('ldc')
        : categoryName
          ? i18n.t(categoryName as TranslationKey, {
              defaultValue: categoryName,
            })
          : i18n.t('standard')
    return {
      key: report.id,
      primary: `${duration(minutes)} · ${type}`,
      secondary: report.note || undefined,
    }
  })

  const planLines = [
    ...dayPlans.map((plan) => ({
      key: plan.id,
      anytime: !!plan.anytime,
      start: getStartTimeInMinutes(plan),
      minutes: plan.minutes,
      detail: plan.title || plan.note,
    })),
    ...recurringPlans.map((plan) => ({
      key: plan.id,
      anytime: isRecurringPlanAnytimeOnDate(plan, date),
      start: getEffectiveStartTimeInMinutesForRecurringPlan(plan, date),
      minutes: getEffectiveMinutesForRecurringPlan(plan, date),
      detail: plan.title || getEffectiveNoteForRecurringPlan(plan, date),
    })),
  ]
    // Anytime Plans first, like all-day events.
    .sort((a, b) => (a.anytime ? -1 : a.start) - (b.anytime ? -1 : b.start))
    .map(
      (plan): Line => ({
        key: plan.key,
        primary: `${
          plan.anytime ? i18n.t('planAnytime') : formatStartTime(plan.start)
        } · ${duration(plan.minutes)}`,
        secondary: plan.detail || undefined,
      })
    )

  const section = (title: string, lines: Line[]) =>
    lines.length ? (
      <View style={{ gap: 6 }}>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('xs'),
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {title}
        </Text>
        {lines.map((line) => (
          <View key={line.key} style={{ gap: 2 }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {line.primary}
            </Text>
            {line.secondary ? (
              <Text
                numberOfLines={2}
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {line.secondary}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    ) : null

  return (
    <View
      style={{
        width: 300,
        padding: 16,
        gap: 12,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.card,
      }}
    >
      <Text
        style={{
          fontFamily: theme.fonts.bold,
          fontSize: theme.fontSize('lg'),
        }}
      >
        {formatDate(date)}
      </Text>
      {section(i18n.t('timeReports'), reportLines)}
      {section(i18n.t('plans'), planLines)}
    </View>
  )
}
