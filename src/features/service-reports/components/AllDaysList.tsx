import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { View } from 'react-native'
import { useNavigation as useRootNavigation } from '@react-navigation/native'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'

import useServiceReport from '@/stores/serviceReport'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { getMonthsReports } from '@/lib/serviceReport'
import { ServiceReport } from '@/types/serviceReport'
import { RootStackNavigation } from '@/types/rootStack'

import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '@/features/service-reports/components/SelectedDateSheet'
import Badge from '@/components/ui/Badge'
import { useCardStyle } from '@/components/ui/Card'

interface AllDaysListProps {
  month: number
  year: number
}

type DayRow = {
  date: Date
  dayLabel: string
  isToday: boolean
  hoursLabel: string
  categoryLabel: string
  isEmpty: boolean
}

/**
 * Flat "ALL DAYS" list for the Month tab. One row per calendar day of the
 * selected month, most-recent first. In the current month, future days are
 * omitted. Tapping a row opens `SelectedDateSheet` for that date.
 *
 * Aggregation per day:
 *
 * - Multiple reports with the same tag/type → show that category label.
 * - Multiple categories → show `i18n.t('multiple')`.
 * - Zero reports → em-dash for both category and hours.
 */
const AllDaysList = ({ month, year }: AllDaysListProps) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const { serviceReports } = useServiceReport()
  const rootNavigation = useRootNavigation<RootStackNavigation>()

  const [sheet, setSheet] = useState<SelectedDateSheetState>({
    open: false,
    date: new Date(),
  })

  const pendingNavigation = useRef<(() => void) | null>(null)

  const handleAddTime = useCallback(() => {
    pendingNavigation.current = () => {
      rootNavigation.navigate('Add Time', {
        date: sheet.date.toISOString(),
      })
    }
  }, [rootNavigation, sheet.date])

  const handlePlanDay = useCallback(() => {
    pendingNavigation.current = () => {
      rootNavigation.navigate('PlanDay', {
        date: sheet.date.toISOString(),
      })
    }
  }, [rootNavigation, sheet.date])

  const handleNavigateToPlanDay = useCallback(
    (existingDayPlanId: string) => {
      pendingNavigation.current = () => {
        rootNavigation.navigate('PlanDay', {
          date: sheet.date.toISOString(),
          existingDayPlanId,
        })
      }
    },
    [rootNavigation, sheet.date]
  )

  const handleNavigateToRecurringPlan = useCallback(
    (existingRecurringPlanId: string, recurringPlanDate: string) => {
      pendingNavigation.current = () => {
        rootNavigation.navigate('PlanDay', {
          date: sheet.date.toISOString(),
          existingRecurringPlanId,
          recurringPlanDate,
        })
      }
    },
    [rootNavigation, sheet.date]
  )

  const handleEditTimeReport = useCallback(
    (report: ServiceReport) => {
      pendingNavigation.current = () => {
        rootNavigation.navigate('Add Time', {
          existingReport: JSON.stringify(report),
        })
      }
    },
    [rootNavigation]
  )

  useEffect(() => {
    if (!sheet.open && pendingNavigation.current) {
      const callback = pendingNavigation.current
      pendingNavigation.current = null
      setTimeout(callback, 125)
    }
  }, [sheet.open])

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  const rows = useMemo<DayRow[]>(() => {
    const now = moment()
    const isCurrentMonth = now.month() === month && now.year() === year
    const base = moment().month(month).year(year).startOf('month')
    const daysInMonth = base.daysInMonth()
    const limit = isCurrentMonth ? now.date() : daysInMonth

    const entries: DayRow[] = []
    for (let d = 1; d <= limit; d++) {
      const day = moment(base).date(d)
      const reportsForDay = thisMonthsReports.filter((r) =>
        moment(r.date).isSame(day, 'day')
      )

      const totalHours =
        reportsForDay.reduce((acc, r) => acc + r.hours + r.minutes / 60, 0) || 0
      const hoursLabel =
        reportsForDay.length === 0
          ? '—'
          : `${(Math.round(totalHours * 10) / 10).toString()}${i18n.t('hoursCompact')}`

      let categoryLabel = '—'
      if (reportsForDay.length > 0) {
        const keyFor = (r: ServiceReport): string => {
          if (r.rollover) return '__rollover__'
          if (r.ldc) return '__ldc__'
          if (r.tag) return `tag:${r.tag}`
          return '__standard__'
        }
        const keys = new Set(reportsForDay.map(keyFor))
        if (keys.size > 1) {
          categoryLabel = i18n.t('multiple')
        } else {
          const [only] = Array.from(keys)
          if (only === '__rollover__') {
            categoryLabel = i18n.t('timeRollover_rowLabel')
          } else if (only === '__ldc__') {
            categoryLabel = i18n.t('ldc')
          } else if (only === '__standard__') {
            categoryLabel = i18n.t('standard')
          } else {
            categoryLabel = only.replace(/^tag:/, '')
          }
        }
      }

      const isToday = isCurrentMonth && d === now.date()

      entries.push({
        date: day.toDate(),
        dayLabel: day.format('ddd · MMM D'),
        isToday,
        hoursLabel,
        categoryLabel,
        isEmpty: reportsForDay.length === 0,
      })
    }

    // Most-recent first
    return entries.sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [thisMonthsReports, month, year])

  return (
    <View style={{ gap: 8 }}>
      <View style={{ gap: 6 }}>
        {rows.map((row) => (
          <Button
            key={row.date.toISOString()}
            onPress={() => setSheet({ open: true, date: row.date })}
            style={{
              ...cardStyle,
              paddingVertical: 12,
              paddingHorizontal: 15,
              marginHorizontal: 15,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: row.isEmpty ? theme.colors.textAlt : theme.colors.text,
                }}
                numberOfLines={1}
              >
                {row.dayLabel}
              </Text>
              {row.isToday ? <Badge size='xs'>{i18n.t('today')}</Badge> : null}
            </View>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
              numberOfLines={1}
            >
              {row.categoryLabel}
            </Text>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: row.isEmpty ? theme.colors.textAlt : theme.colors.text,
                minWidth: 44,
                textAlign: 'right',
              }}
            >
              {row.hoursLabel}
            </Text>
            <IconButton icon={faChevronRight} size={12} />
          </Button>
        ))}
      </View>

      <SelectedDateSheet
        sheet={sheet}
        setSheet={setSheet}
        thisMonthsReports={thisMonthsReports}
        onAddTime={handleAddTime}
        onPlanDay={handlePlanDay}
        onNavigateToPlanDay={handleNavigateToPlanDay}
        onNavigateToRecurringPlan={handleNavigateToRecurringPlan}
        onEditTimeReport={handleEditTimeReport}
      />
    </View>
  )
}

export default AllDaysList
