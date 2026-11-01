import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { useMemo } from 'react'
import { View } from 'react-native'
import moment from 'moment'
import { useNavigation } from '@react-navigation/native'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Card from '@/components/ui/Card'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useLocalDay from '@/hooks/useLocalDay'
import useStartOfWeek from '@/hooks/useStartOfWeek'
import useServiceReport from '@/stores/serviceReport'
import { getMonthsReports } from '@/lib/serviceReport'
import {
  DayPlan,
  RecurringPlan,
  TimeEntry,
  TimeEntriesByYear,
} from '@/types/timeEntry'
import { HomeTabStackNavigation } from '@/types/homeStack'
import CalendarDay, { type DateData } from '@/components/CalendarDay'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import { tracking } from '@/lib/tracking'

type Props = {
  month: number
  year: number
  monthsReports: TimeEntry[] | null

  today?: moment.Moment

  dayPlansOverride?: DayPlan[]
  recurringPlansOverride?: RecurringPlan[]
  serviceReportsOverride?: TimeEntriesByYear

  onOpenSchedule?: () => void

  onSelectDay?: (date: Date) => void
}

const WeekStripTeaser = ({
  month,
  year,
  monthsReports,
  today: todayProp,
  dayPlansOverride,
  recurringPlansOverride,
  serviceReportsOverride,
  onOpenSchedule,
  onSelectDay,
}: Props) => {
  const theme = useTheme()
  const startOfWeek = useStartOfWeek()
  const { serviceReports: storeServiceReports } = useServiceReport()
  const serviceReports = serviceReportsOverride ?? storeServiceReports
  const navigation = useNavigation<HomeTabStackNavigation>()

  const localDay = useLocalDay()
  const today = useMemo(
    () => todayProp ?? moment(localDay, 'YYYY-MM-DD').hour(12),
    [todayProp, localDay]
  )

  const selectedMonth = useMemo(
    () => moment().month(month).year(year),
    [month, year]
  )
  const isCurrentMonth = useMemo(
    () => today.isSame(selectedMonth, 'month'),
    [today, selectedMonth]
  )

  const weekAnchor = useMemo(() => {
    if (isCurrentMonth) return today.clone()
    return selectedMonth.clone().startOf('month')
  }, [isCurrentMonth, selectedMonth, today])

  const days = useMemo(() => {
    const startOfStripWeek = weekAnchor.clone().day(startOfWeek)

    if (startOfStripWeek.isAfter(weekAnchor)) {
      startOfStripWeek.subtract(7, 'days')
    }
    return Array.from({ length: 7 }, (_, i) =>
      startOfStripWeek.clone().add(i, 'days')
    )
  }, [startOfWeek, weekAnchor])

  const weekReports = useMemo(() => {
    const first = days[0]
    const last = days[days.length - 1]
    const firstMonthReports =
      first.month() === month && first.year() === year
        ? (monthsReports ?? [])
        : getMonthsReports(serviceReports, first.month(), first.year())
    if (first.isSame(last, 'month')) return firstMonthReports
    const lastMonthReports =
      last.month() === month && last.year() === year
        ? (monthsReports ?? [])
        : getMonthsReports(serviceReports, last.month(), last.year())
    return [...firstMonthReports, ...lastMonthReports]
  }, [days, month, year, monthsReports, serviceReports])

  const openSchedule =
    onOpenSchedule ?? (() => navigation.navigate('Schedule', { month, year }))

  const openSelectedDay = (day: DateData | undefined) => {
    if (!day) return
    onSelectDay?.(moment(day.dateString).toDate())
  }

  const header = (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        columnGap: 8,
      }}
    >
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          textTransform: 'uppercase',
          letterSpacing: tracking(0.5),
        }}
      >
        {isCurrentMonth ? i18n.t('thisWeek') : i18n.t('schedule')}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexShrink: 1,
          gap: 4,
        }}
      >
        <Text
          style={{
            flexShrink: 1,
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('viewFullSchedule')}
        </Text>
        <LucideIcon
          icon={ChevronForwardIcon}
          size={12}
          color={theme.colors.textAlt}
        />
      </View>
    </View>
  )

  const strip = (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 4,
      }}
    >
      {days.map((day) => {
        const inSelectedMonth = day.isSame(selectedMonth, 'month')
        const dateString = day.format('YYYY-MM-DD')
        const dateData: DateData = {
          year: day.year(),
          month: day.month() + 1,
          day: day.date(),
          timestamp: day.valueOf(),
          dateString,
        }
        return (
          <View
            key={dateString}
            style={{ flex: 1, alignItems: 'center', gap: 4 }}
          >
            {}
            <Text
              accessibilityElementsHidden
              importantForAccessibility='no'
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
                fontFamily: theme.fonts.medium,
              }}
            >
              {day.format('dd').charAt(0)}
            </Text>
            <CalendarDay
              date={dateData}
              state={inSelectedMonth ? '' : 'disabled'}
              monthsReports={weekReports}
              onPress={openSelectedDay}
              height={50}
              dayPlansOverride={dayPlansOverride}
              recurringPlansOverride={recurringPlansOverride}
            />
          </View>
        )
      })}
    </View>
  )

  if (onOpenSchedule) {
    return (
      <Card>
        <View style={{ gap: 12 }}>
          <Button onPress={openSchedule} noTransform>
            {header}
          </Button>
          {strip}
        </View>
      </Card>
    )
  }

  return (
    <HomeSectionMenu
      onPress={openSchedule}
      accessible={false}
      hoverRadius={theme.numbers.borderRadiusLg}
      actions={[
        {
          id: 'open_schedule',
          title: i18n.t('openSchedule'),
          systemImage: 'calendar',
          onPress: openSchedule,
        },
      ]}
    >
      <Card>
        <View style={{ gap: 12 }}>
          <View
            accessible
            accessibilityRole='button'
            accessibilityLabel={i18n.t('viewFullSchedule')}
            accessibilityActions={[{ name: 'activate' }]}
            onAccessibilityAction={openSchedule}
          >
            {header}
          </View>
          {strip}
        </View>
      </Card>
    </HomeSectionMenu>
  )
}

export default WeekStripTeaser
