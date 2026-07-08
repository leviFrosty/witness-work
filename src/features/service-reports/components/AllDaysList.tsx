import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'
import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { View } from 'react-native'
import { useNavigation as useRootNavigation } from '@react-navigation/native'
import moment from 'moment'

import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { getMonthsReports } from '@/lib/serviceReport'
import {
  getPlansIntersectingDay,
  getEffectiveMinutesForRecurringPlan,
} from '@/lib/recurrence'
import { getCategoryLabel, isLdcEntry } from '@/lib/serviceReportCategory'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import { TimeEntry } from '@/types/timeEntry'
import { RootStackNavigation } from '@/types/rootStack'

import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '@/features/service-reports/components/SelectedDateSheet'
import Badge from '@/components/ui/Badge'
import { useCardStyle } from '@/components/ui/Card'
import Circle from '@/components/ui/Circle'
import { getDateStatusColor } from '@/components/CalendarDay'
import { formatMonthDayCompact } from '@/lib/dates'

interface AllDaysListProps {
  month: number
  year: number
}

type DayRow = {
  date: Date
  dayOfWeekLabel: string
  monthDayLabel: string
  isToday: boolean
  hoursLabel: string
  categoryLabel: string
  isEmpty: boolean
  planDotColor: string | null
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
  const { serviceReports, dayPlans, recurringPlans } = useServiceReport()
  const { categories } = useCategories()
  const { timeDisplayFormat } = usePreferences()
  const rootNavigation = useRootNavigation<RootStackNavigation>()

  const [sheet, setSheet] = useState<SelectedDateSheetState>({
    open: false,
    date: new Date(),
  })

  const [showAllDays, setShowAllDays] = useState(false)

  const { isCurrentMonth, daysInMonth } = useMemo(() => {
    const now = moment()
    const base = moment().month(month).year(year).startOf('month')
    return {
      isCurrentMonth: now.month() === month && now.year() === year,
      daysInMonth: base.daysInMonth(),
    }
  }, [month, year])

  const hasFutureDays = isCurrentMonth && moment().date() < daysInMonth

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
    (report: TimeEntry) => {
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
    const base = moment().month(month).year(year).startOf('month')
    const limit = isCurrentMonth && !showAllDays ? now.date() : daysInMonth

    const entries: DayRow[] = []
    for (let d = 1; d <= limit; d++) {
      const day = moment(base).date(d)
      const dayDate = day.toDate()
      const reportsForDay = thisMonthsReports.filter((r) =>
        moment(r.date).isSame(day, 'day')
      )

      const totalMinutes = reportsForDay.reduce(
        (acc, r) => acc + r.hours * 60 + r.minutes,
        0
      )
      const hoursLabel =
        reportsForDay.length === 0
          ? '—'
          : formatMinutes(totalMinutes, timeDisplayFormat).formatted

      const dayPlanForDay = dayPlans.find((dp) =>
        moment(dp.date).isSame(day, 'day')
      )
      const recurringPlansForDay = getPlansIntersectingDay(
        dayDate,
        recurringPlans
      )
      const highestRecurringPlanMinutes = recurringPlansForDay.reduce(
        (max, plan) =>
          Math.max(max, getEffectiveMinutesForRecurringPlan(plan, dayDate)),
        0
      )
      const goalMinutes =
        dayPlanForDay?.minutes || highestRecurringPlanMinutes || 0
      const hasPlan = goalMinutes > 0

      let planDotColor: string | null = null
      if (hasPlan) {
        const isTodayDate = now.isSame(day, 'day')
        const dateInPast = day.isSameOrBefore(now, 'day')
        const wentInService = reportsForDay.length > 0
        const hitGoal = totalMinutes >= goalMinutes
        planDotColor = getDateStatusColor(
          theme,
          wentInService,
          isTodayDate,
          dateInPast,
          hitGoal
        ).bg
      }

      let categoryLabel = '—'
      if (reportsForDay.length > 0) {
        // Group by stable identity: prefer categoryId (post-migration), fall
        // back to the legacy `tag` string for unmigrated entries, with
        // synthetic keys for rollover / plain-standard. LDC is keyed by its
        // builtin Category id like any other Category — `isLdcEntry` also
        // matches legacy `ldc: true` entries so unmigrated installs still
        // bucket correctly.
        const keyFor = (r: TimeEntry): string => {
          if (r.rollover) return '__rollover__'
          if (isLdcEntry(r)) return '__ldc__'
          if (r.categoryId) return `cat:${r.categoryId}`
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
            // Either `cat:<id>` or `tag:<legacy>`. Resolve via the categories
            // store so the user-visible label always reflects the Category's
            // current name, not whatever was stamped at write time.
            categoryLabel =
              getCategoryLabel(reportsForDay[0], categories) ??
              only.replace(/^(cat:|tag:)/, '')
          }
        }
      }

      const isToday = isCurrentMonth && d === now.date()

      entries.push({
        date: dayDate,
        dayOfWeekLabel: day.format('ddd'),
        monthDayLabel: formatMonthDayCompact(day),
        isToday,
        hoursLabel,
        categoryLabel,
        isEmpty: reportsForDay.length === 0,
        planDotColor,
      })
    }

    // Most-recent first
    return entries.sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [
    thisMonthsReports,
    month,
    year,
    categories,
    timeDisplayFormat,
    dayPlans,
    recurringPlans,
    theme,
    isCurrentMonth,
    daysInMonth,
    showAllDays,
  ])

  return (
    <View style={{ gap: 8 }}>
      <View style={{ gap: 6 }}>
        <View
          style={{
            marginHorizontal: 15,
            paddingHorizontal: 15,
            paddingBottom: 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
            numberOfLines={1}
          >
            {i18n.t('date')}
          </Text>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
            numberOfLines={1}
          >
            {i18n.t('category')}
          </Text>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              minWidth: 44,
              textAlign: 'right',
            }}
            numberOfLines={1}
          >
            {i18n.t('hours')}
          </Text>
          <View style={{ width: 12 }} />
        </View>
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
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: row.isEmpty
                      ? theme.colors.textAlt
                      : theme.colors.text,
                  }}
                  numberOfLines={1}
                >
                  {row.dayOfWeekLabel}
                </Text>
                {row.planDotColor ? (
                  <Circle color={row.planDotColor} size={6} />
                ) : (
                  <Circle
                    color='transparent'
                    size={6}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.textAlt,
                    }}
                  />
                )}
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: row.isEmpty
                      ? theme.colors.textAlt
                      : theme.colors.text,
                  }}
                  numberOfLines={1}
                >
                  {row.monthDayLabel}
                </Text>
              </View>
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
            <IconButton icon={ChevronRightIcon} size={12} />
          </Button>
        ))}
        {hasFutureDays && (
          <Button
            onPress={() => setShowAllDays((v) => !v)}
            style={{
              alignSelf: 'center',
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
          >
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                fontFamily: theme.fonts.semiBold,
                textDecorationLine: 'underline',
              }}
            >
              {showAllDays ? i18n.t('hideFutureDays') : i18n.t('showAllDays')}
            </Text>
          </Button>
        )}
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
