import { useMemo } from 'react'
import { View } from 'react-native'
import { momentStoredDate } from '@/lib/normalizeDate'

import useTheme from '@/contexts/theme'
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import useServiceReport from '@/stores/serviceReport'
import {
  getEarliestReportDate,
  getLifetimeHours,
  getLifetimeMinutes,
  getServiceYearEndYearsSpan,
} from '@/lib/serviceReport'
import { TimeEntry } from '@/types/timeEntry'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { formatMinutes } from '@/lib/minutes'
import { formatNumber } from '@/lib/numbers'

import GlassCard from '@/components/ui/GlassCard'
import Chip from '@/components/ui/Chip'
import Text from '@/components/ui/MyText'
import { tracking } from '@/lib/tracking'
import { formatDisplay } from '@/lib/dates'

/**
 * Flattens the store's `TimeEntriesByYear` shape into a single `TimeEntry[]`.
 * Kept inline so the component stays a one-stop-shop for the All-time tab's
 * hero card.
 */
const useFlatServiceReports = (): TimeEntry[] => {
  const { serviceReports } = useServiceReport()
  return useMemo(() => {
    const flat: TimeEntry[] = []
    for (const year in serviceReports) {
      const months = serviceReports[year]
      for (const month in months) {
        const reports = months[month]
        if (reports) flat.push(...reports)
      }
    }
    return flat
  }, [serviceReports])
}

/**
 * Big-hero lifetime hours card for the Progress > All-time tab. Renders:
 *
 * - An eyebrow label ("LIFETIME HOURS").
 * - The raw unadjusted lifetime total, thousands-separated.
 * - A subtitle ("since MMM YYYY · N service years").
 * - A tappable info chip that toggles a short explainer about how the number is
 *   computed (unadjusted for credit caps).
 *
 * The parent (`ProgressAllTimeTab`) handles the zero-data empty state, so this
 * card assumes at least one report exists.
 */
const LifetimeHoursCard = () => {
  const theme = useTheme()
  const largeText = useAccessibilityTextSize()
  const reports = useFlatServiceReports()
  const { timeDisplayFormat } = usePreferences()

  const lifetimeMinutes = useMemo(() => getLifetimeMinutes(reports), [reports])
  const lifetimeHours = useMemo(() => getLifetimeHours(reports), [reports])
  const earliestDate = useMemo(() => getEarliestReportDate(reports), [reports])
  const endYears = useMemo(() => getServiceYearEndYearsSpan(reports), [reports])

  const isDecimal = timeDisplayFormat === 'decimal'

  // The decimal hero's number, which the unit after it agrees with.
  const heroHours =
    lifetimeHours >= 100
      ? Math.floor(lifetimeHours)
      : Math.round(lifetimeHours * 10) / 10

  const formattedLifetime = useMemo(() => {
    if (!isDecimal) {
      // Short format owns its own unit and includes minutes, so render the full
      // formatter output (e.g. "1,234h 30m") and suppress the trailing unit.
      return formatMinutes(lifetimeMinutes, timeDisplayFormat).formatted
    }
    // Decimal: keep the existing hero treatment (thousands-separated, trim
    // sub-decimal noise once we cross 3 digits) and let the unit suffix
    // render alongside.
    if (lifetimeHours >= 100) {
      return formatNumber(heroHours)
    }
    const hasFraction = Math.abs(heroHours - Math.round(heroHours)) > 0
    return formatNumber(heroHours, {
      minimumFractionDigits: hasFraction ? 1 : 0,
      maximumFractionDigits: 1,
    })
  }, [lifetimeMinutes, lifetimeHours, heroHours, isDecimal, timeDisplayFormat])

  // Decimal hero renders a bare number; pair it with the long-form unit
  // (compact "h" at 100k+ to keep the row from wrapping). Short hero output
  // already carries its own unit — suppress the trailing label.
  const hoursLabel = !isDecimal
    ? ''
    : lifetimeHours >= 100000
      ? i18n.t('hoursCompact')
      : // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
        i18n.t('hoursUnitLabel', { count: heroHours })

  const subtitle = useMemo(() => {
    if (!earliestDate) return null
    return i18n.t('sinceDateServiceYears', {
      date: formatDisplay(momentStoredDate(earliestDate), 'MMM YYYY'),
      count: endYears.length,
    })
  }, [earliestDate, endYears.length])

  return (
    <GlassCard>
      <View style={{ gap: 12 }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            letterSpacing: tracking(0.5),
          }}
        >
          {i18n.t('lifetimeHours').toUpperCase()}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <Text
            // At accessibility sizes the figure shrinks onto one line rather
            // than breaking between its digits.
            {...(largeText && isDecimal ? FIT_ONE_LINE : {})}
            // "Short" mode emits e.g. "1,234h 30m" — at 64pt that's too wide
            // for a single card row. Drop a tier instead of auto-shrinking.
            style={{
              fontSize: isDecimal ? 64 : 40,
              // A fixed line height would keep the full-size line around a
              // shrunk figure.
              lineHeight:
                largeText && isDecimal ? undefined : isDecimal ? 68 : 44,
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
              letterSpacing: tracking(-1),
            }}
          >
            {formattedLifetime}
          </Text>
          {hoursLabel ? (
            <Text
              style={{
                fontSize: theme.fontSize('lg'),
                color: theme.colors.textAlt,
              }}
            >
              {hoursLabel}
            </Text>
          ) : null}
        </View>

        {subtitle ? (
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {subtitle}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Chip icon='ⓘ' tone='info' label={i18n.t('lifetimeHoursInfo')} />
        </View>
      </View>
    </GlassCard>
  )
}

export default LifetimeHoursCard
