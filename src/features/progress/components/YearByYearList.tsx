import {
  Ellipsis as EllipsisIcon,
  Plus as PlusIcon,
  Trash2 as Trash2Icon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useMemo, useState } from 'react'
import { Alert, Pressable, View } from 'react-native'

import * as Crypto from 'expo-crypto'
import moment from 'moment'
import { useToastController } from '@tamagui/toast'

import useTheme from '@/contexts/theme'
import useServiceReport from '@/stores/serviceReport'
import usePublisher from '@/hooks/usePublisher'
import {
  getHoursForServiceYearEndYear,
  getMinutesForServiceYearEndYear,
  getReportCountForServiceYearEndYear,
  getServiceYearEndYearsSpan,
  getAvailableEarlierEndYears,
} from '@/lib/serviceReport'
import { getServiceYearFromDate } from '@/lib/serviceYear'
import { TimeEntry } from '@/types/timeEntry'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'

import Text from '@/components/ui/MyText'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import AddEarlierYearSheet from '@/features/progress/components/AddEarlierYearSheet'

const EARLIER_YEAR_FLOOR_YEARS_BACK = 100

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
  const { timeDisplayFormat } = usePreferences()

  const endYears = useMemo(() => getServiceYearEndYearsSpan(reports), [reports])

  const rows = useMemo(() => {
    const data = endYears.map((endYear) => ({
      endYear,
      hours: getHoursForServiceYearEndYear(reports, endYear),
      minutes: getMinutesForServiceYearEndYear(reports, endYear),
      reportCount: getReportCountForServiceYearEndYear(reports, endYear),
    }))
    // Most-recent first.
    data.sort((a, b) => b.endYear - a.endYear)
    return data
  }, [endYears, reports])

  const { addServiceReport, deleteServiceYearReports } = useServiceReport()
  const toast = useToastController()

  const [sheetOpen, setSheetOpen] = useState(false)

  const confirmDeleteYear = (endYear: number, label: string) => {
    Alert.alert(
      i18n.t('deleteYearTime_title', { year: label }),
      i18n.t('deleteYearTime_description', { year: label }),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('delete'),
          style: 'destructive',
          onPress: () => {
            deleteServiceYearReports(endYear)
            toast.show(i18n.t('success'), {
              message: i18n.t('deleted'),
              native: true,
            })
          },
        },
      ]
    )
  }

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
          {rows.map(({ endYear, hours, minutes, reportCount }) => {
            const ratio = Math.max(0, Math.min(1, hours / divisor))
            const startYear = endYear - 1
            const endShort = String(endYear % 100).padStart(2, '0')
            const label = `${startYear}—${endShort}`
            const totalDisplay = formatMinutes(
              minutes,
              timeDisplayFormat
            ).formatted

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
                  {totalDisplay}
                </Text>

                {reportCount > 0 && (
                  <AnchoredPopover
                    contentWidth={220}
                    contentStyle={{ padding: 4 }}
                    renderTrigger={({ onPress, anchorRef }) => (
                      <View ref={anchorRef} collapsable={false}>
                        <Pressable
                          accessibilityRole='button'
                          accessibilityLabel={i18n.t('yearRow_moreActions', {
                            year: label,
                          })}
                          onPress={onPress}
                          hitSlop={10}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.7 : 1,
                            paddingLeft: 2,
                          })}
                        >
                          <LucideIcon
                            icon={EllipsisIcon}
                            color={theme.colors.textAlt}
                            size={16}
                          />
                        </Pressable>
                      </View>
                    )}
                  >
                    {({ close }) => (
                      <Pressable
                        accessibilityRole='button'
                        onPress={() => {
                          close()
                          confirmDeleteYear(endYear, label)
                        }}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.7 : 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          paddingVertical: 10,
                          paddingHorizontal: 10,
                          borderRadius: theme.numbers.borderRadiusSm,
                        })}
                      >
                        <LucideIcon
                          icon={Trash2Icon}
                          color={theme.colors.error}
                          size={14}
                        />
                        <Text
                          style={{
                            fontFamily: theme.fonts.semiBold,
                            color: theme.colors.error,
                            fontSize: theme.fontSize('sm'),
                          }}
                        >
                          {i18n.t('deleteYearTime')}
                        </Text>
                      </Pressable>
                    )}
                  </AnchoredPopover>
                )}
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
              <LucideIcon icon={PlusIcon} color={theme.colors.text} size={14} />
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
