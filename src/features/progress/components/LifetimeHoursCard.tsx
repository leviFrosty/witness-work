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

  const heroHours =
    lifetimeHours >= 100
      ? Math.floor(lifetimeHours)
      : Math.round(lifetimeHours * 10) / 10

  const formattedLifetime = useMemo(() => {
    if (!isDecimal) {
      return formatMinutes(lifetimeMinutes, timeDisplayFormat).formatted
    }

    if (lifetimeHours >= 100) {
      return formatNumber(heroHours)
    }
    const hasFraction = Math.abs(heroHours - Math.round(heroHours)) > 0
    return formatNumber(heroHours, {
      minimumFractionDigits: hasFraction ? 1 : 0,
      maximumFractionDigits: 1,
    })
  }, [lifetimeMinutes, lifetimeHours, heroHours, isDecimal, timeDisplayFormat])

  const hoursLabel = !isDecimal
    ? ''
    : lifetimeHours >= 100000
      ? i18n.t('hoursCompact')
      : i18n.t('hoursUnitLabel', { count: heroHours })

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
            {...(largeText && isDecimal ? FIT_ONE_LINE : {})}
            style={{
              fontSize: isDecimal ? 64 : 40,

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
