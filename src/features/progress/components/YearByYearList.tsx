import { Plus as PlusIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import { useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

import moment from 'moment'
import round from 'lodash/round'

import useTheme from '@/contexts/theme'
import useServiceReport from '@/stores/serviceReport'
import usePublisher from '@/hooks/usePublisher'
import { useNavigation } from '@react-navigation/native'
import type { RootStackNavigation } from '@/types/rootStack'
import {
  getServiceYearEndYearsSpan,
  getServiceYearTotalsByEndYear,
  getAvailableEarlierEndYears,
} from '@/lib/serviceReport'
import { getServiceYearFromDate } from '@/lib/serviceYear'
import { TimeEntry } from '@/types/timeEntry'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { formatPlainNumber, localizeAppDigits } from '@/lib/numbers'
import { usePreferences } from '@/stores/preferences'

import Text from '@/components/ui/MyText'
import ContextMenu from '@/components/ui/ContextMenu'
import useConfirmDeleteServiceYear from '@/features/service-reports/hooks/useConfirmDeleteServiceYear'
import YearSummaryPreview from '@/features/progress/components/YearSummaryPreview'
import AddEarlierYearSheet from '@/features/progress/components/AddEarlierYearSheet'
import { alignText } from '@/lib/direction'
import { tracking } from '@/lib/tracking'

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

interface YearByYearListProps {
  onYearPress: (endYear: number) => void
}

const YearByYearList = ({ onYearPress }: YearByYearListProps) => {
  const theme = useTheme()
  const reports = useFlatServiceReports()
  const { annualGoalHours } = usePublisher()
  const { timeDisplayFormat } = usePreferences()

  const endYears = useMemo(() => getServiceYearEndYearsSpan(reports), [reports])

  const rows = useMemo(() => {
    const totals = getServiceYearTotalsByEndYear(reports)
    const data = endYears.map((endYear) => {
      const minutes = totals.get(endYear)?.minutes ?? 0
      return {
        endYear,
        hours: round(minutes / 60, 1),
        minutes,
        reportCount: totals.get(endYear)?.reportCount ?? 0,
      }
    })

    data.sort((a, b) => b.endYear - a.endYear)
    return data
  }, [endYears, reports])

  const navigation = useNavigation<RootStackNavigation>()
  const confirmDeleteYear = useConfirmDeleteServiceYear()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [addHovered, setAddHovered] = useState(false)

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
    setSheetOpen(false)
    navigation.navigate('ServiceHistory', {
      serviceYear: endYear - 1,
      source: 'add_earlier_year',
    })
  }

  const divisor = useMemo(() => {
    if (annualGoalHours > 0) return annualGoalHours

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
            letterSpacing: tracking(0.5),
            paddingHorizontal: 29,
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
            const label = i18n.t('scheduleCalendar.serviceYearSpanShort', {
              start: formatPlainNumber(startYear),
              end: localizeAppDigits(String(endYear % 100).padStart(2, '0')),
            })
            const totalDisplay = formatMinutes(
              minutes,
              timeDisplayFormat
            ).formatted

            const hasFinishedMonths = moment({
              year: startYear,
              month: 8,
            }).isBefore(moment(), 'month')

            return (
              <ContextMenu
                key={endYear}
                onPress={() => onYearPress(endYear)}
                hoverRadius={theme.numbers.borderRadiusSm}
                accessibilityLabel={`${label}, ${totalDisplay}`}
                preview={<YearSummaryPreview endYear={endYear} />}
                actions={[
                  [
                    {
                      id: 'view_year',
                      title: i18n.t('viewYear'),
                      systemImage: 'calendar',
                      onPress: () => onYearPress(endYear),
                    },
                    hasFinishedMonths && {
                      id: 'edit_service_history',
                      title: i18n.t('serviceHistory.edit'),
                      systemImage: 'pencil',
                      onPress: () =>
                        navigation.navigate('ServiceHistory', {
                          serviceYear: startYear,
                          source: 'year_row_menu',
                        }),
                    },
                  ],
                  reportCount > 0 && [
                    {
                      id: 'delete_year',
                      title: i18n.t('deleteThisYearsTime'),
                      systemImage: 'trash',
                      destructive: true,
                      onPress: () => confirmDeleteYear({ endYear }),
                    },
                  ],
                ]}
              >
                <View
                  style={{
                    backgroundColor: theme.colors.card,
                    borderRadius: theme.numbers.borderRadiusSm,
                    borderCurve: 'continuous',
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
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
                      textAlign: alignText('end'),
                    }}
                  >
                    {totalDisplay}
                  </Text>
                </View>
              </ContextMenu>
            )
          })}

          {availableEndYears.length > 0 && (
            <PointerHover onHoverChange={setAddHovered}>
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
                <LucideIcon
                  icon={PlusIcon}
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
                <HoverTint
                  visible={addHovered}
                  borderRadius={theme.numbers.borderRadiusSm}
                  borderCurve='continuous'
                />
              </Pressable>
            </PointerHover>
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
