import { useMemo } from 'react'
import { View } from 'react-native'
import moment from 'moment'

import useTheme from '../contexts/theme'
import useServiceReport from '../stores/serviceReport'
import {
  getEarliestReportDate,
  getLifetimeHours,
  getServiceYearEndYearsSpan,
} from '../lib/serviceReport'
import { ServiceReport } from '../types/serviceReport'
import i18n from '../lib/locales'

import GlassCard from './GlassCard'
import Chip from './Chip'
import Text from './MyText'

/**
 * Flattens the store's `ServiceReportsByYears` shape into a single
 * `ServiceReport[]`. Kept inline so the component stays a one-stop-shop for the
 * All-time tab's hero card.
 */
const useFlatServiceReports = (): ServiceReport[] => {
  const { serviceReports } = useServiceReport()
  return useMemo(() => {
    const flat: ServiceReport[] = []
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
  const reports = useFlatServiceReports()

  const lifetimeHours = useMemo(() => getLifetimeHours(reports), [reports])
  const earliestDate = useMemo(() => getEarliestReportDate(reports), [reports])
  const endYears = useMemo(() => getServiceYearEndYearsSpan(reports), [reports])

  const formattedLifetime = useMemo(() => {
    // Thousands-separator via toLocaleString; keep a single decimal place only
    // when the fractional part is non-zero to avoid "4,218.0" noise.
    const rounded = Math.round(lifetimeHours * 10) / 10
    const hasFraction = Math.abs(rounded - Math.round(rounded)) > 0
    return rounded.toLocaleString(undefined, {
      minimumFractionDigits: hasFraction ? 1 : 0,
      maximumFractionDigits: 1,
    })
  }, [lifetimeHours])

  const subtitle = useMemo(() => {
    if (!earliestDate) return null
    return i18n.t('sinceDateServiceYears', {
      date: moment(earliestDate).format('MMM YYYY'),
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
            letterSpacing: 0.5,
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
            style={{
              fontSize: theme.fontSize('4xl'),
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
              letterSpacing: -1,
            }}
          >
            {formattedLifetime}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('hours_lowercase')}
          </Text>
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
