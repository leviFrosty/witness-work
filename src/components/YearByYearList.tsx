import { useMemo } from 'react'
import { Pressable, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'

import useTheme from '../contexts/theme'
import useServiceReport from '../stores/serviceReport'
import usePublisher from '../hooks/usePublisher'
import {
  getHoursForServiceYearEndYear,
  getServiceYearEndYearsSpan,
} from '../lib/serviceReport'
import { ServiceReport } from '../types/serviceReport'
import i18n from '../lib/locales'
import { HomeTabStackNavigation } from '../types/homeStack'

import Text from './MyText'

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
 * "Year by Year" list for the All-time tab. Renders one row per service year in
 * the continuous span from the earliest report's service year to the current
 * one, most-recent first. Each row:
 *
 * - `{startYear}—{endYearShort}` label on the left (e.g. `2024—25`).
 * - A proportional fill bar in the middle (year's hours ÷ current annual goal,
 *   capped at 100%). If the user has no annual goal, the bar's divisor falls
 *   back to the max-hours year so rows still render comparatively.
 * - `{hours}h` on the right.
 *
 * Tapping a row navigates to the Progress > Year tab for that service year.
 */
const YearByYearList = () => {
  const theme = useTheme()
  const navigation = useNavigation<HomeTabStackNavigation>()
  const reports = useFlatServiceReports()
  const { annualGoalHours } = usePublisher()

  const endYears = useMemo(() => getServiceYearEndYearsSpan(reports), [reports])

  const rows = useMemo(() => {
    const data = endYears.map((endYear) => ({
      endYear,
      hours: getHoursForServiceYearEndYear(reports, endYear),
    }))
    // Most-recent first.
    data.sort((a, b) => b.endYear - a.endYear)
    return data
  }, [endYears, reports])

  const divisor = useMemo(() => {
    if (annualGoalHours > 0) return annualGoalHours
    // Fallback so bars remain meaningful when the user has no annual goal.
    const max = rows.reduce((m, r) => Math.max(m, r.hours), 0)
    return max > 0 ? max : 1
  }, [annualGoalHours, rows])

  if (rows.length === 0) return null

  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          letterSpacing: 0.5,
          paddingHorizontal: 15,
          textTransform: 'uppercase',
        }}
      >
        {i18n.t('yearByYear')}
      </Text>

      <View
        style={{
          paddingHorizontal: 15,
          gap: 6,
        }}
      >
        {rows.map(({ endYear, hours }) => {
          const ratio = Math.max(0, Math.min(1, hours / divisor))
          const startYear = endYear - 1
          const endShort = String(endYear % 100).padStart(2, '0')
          const label = `${startYear}—${endShort}`

          return (
            <Pressable
              key={endYear}
              accessibilityRole='button'
              onPress={() =>
                navigation.navigate('Progress', {
                  tab: 'year',
                  year: endYear,
                })
              }
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                backgroundColor: theme.colors.card,
                borderRadius: theme.numbers.borderRadiusSm,
                borderCurve: 'continuous',
                paddingVertical: 12,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              })}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                  fontSize: theme.fontSize('sm'),
                  minWidth: 72,
                }}
              >
                {label}
              </Text>

              <View
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: theme.colors.border,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${ratio * 100}%`,
                    height: '100%',
                    backgroundColor: theme.colors.accent,
                    borderRadius: 999,
                  }}
                />
              </View>

              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                  fontSize: theme.fontSize('sm'),
                  minWidth: 56,
                  textAlign: 'right',
                }}
              >
                {hours}h
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

export default YearByYearList
