import { useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

import * as Crypto from 'expo-crypto'
import moment from 'moment'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'

import useTheme from '../../../contexts/theme'
import useServiceReport from '../../../stores/serviceReport'
import usePublisher from '../../../hooks/usePublisher'
import {
  getHoursForServiceYearEndYear,
  getServiceYearEndYearsSpan,
  getAvailableEarlierEndYears,
  getServiceYearFromDate,
} from '../../../lib/serviceReport'
import { ServiceReport } from '../../../types/serviceReport'
import i18n from '../../../lib/locales'

import Text from '../../../components/MyText'
import AddEarlierYearSheet from '../../../components/AddEarlierYearSheet'

const EARLIER_YEAR_FLOOR_YEARS_BACK = 100

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
 * - `{hours}{hoursCompact}` on the right (localized hour abbreviation).
 *
 * Tapping a row navigates to the Progress > Year tab for that service year.
 */
interface YearByYearListProps {
  /** Invoked when the user taps a year row — parent switches to Year tab. */
  onYearPress: (endYear: number) => void
}

const YearByYearList = ({ onYearPress }: YearByYearListProps) => {
  const theme = useTheme()
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

  const { addServiceReport } = useServiceReport()

  const [sheetOpen, setSheetOpen] = useState(false)

  const availableEndYears = useMemo(() => {
    if (endYears.length === 0) return []
    const currentEndYear = getServiceYearFromDate(moment()) + 1
    return getAvailableEarlierEndYears(
      endYears,
      currentEndYear,
      EARLIER_YEAR_FLOOR_YEARS_BACK
    )
  }, [endYears])

  const handleAddEarlierYear = (endYear: number) => {
    const startYear = endYear - 1
    // Sept 1 = canonical start of a JW service year. Noon avoids any DST edge
    // case that could shift the stored calendar day.
    const date = new Date(startYear, 8, 1, 12, 0, 0, 0)
    addServiceReport({
      id: Crypto.randomUUID(),
      hours: 0,
      minutes: 0,
      date,
    })
    setSheetOpen(false)
  }

  const divisor = useMemo(() => {
    if (annualGoalHours > 0) return annualGoalHours
    // Fallback so bars remain meaningful when the user has no annual goal.
    const max = rows.reduce((m, r) => Math.max(m, r.hours), 0)
    return max > 0 ? max : 1
  }, [annualGoalHours, rows])

  if (rows.length === 0) return null

  return (
    <>
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
                onPress={() => onYearPress(endYear)}
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
                  {hours}
                  {i18n.t('hoursCompact')}
                </Text>
              </Pressable>
            )
          })}

          {availableEndYears.length > 0 && (
            <Pressable
              accessibilityRole='button'
              onPress={() => setSheetOpen(true)}
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
              <FontAwesomeIcon
                icon={faPlus}
                color={theme.colors.text}
                size={14}
              />
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('addEarlierYear')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
      <AddEarlierYearSheet
        open={sheetOpen}
        availableEndYears={availableEndYears}
        onConfirm={handleAddEarlierYear}
        onClose={() => setSheetOpen(false)}
      />
    </>
  )
}

export default YearByYearList
