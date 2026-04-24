import { useMemo } from 'react'
import { View } from 'react-native'
import moment from 'moment'
import { useNavigation } from '@react-navigation/native'
import Text from './MyText'
import Button from './Button'
import IconButton from './IconButton'
import GlassCard from './GlassCard'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import { usePreferences } from '../stores/preferences'
import useServiceReport from '../stores/serviceReport'
import { getMonthsReports } from '../lib/serviceReport'
import { ServiceReport } from '../types/serviceReport'
import { HomeTabStackNavigation } from '../types/homeStack'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons'
import CalendarDay from './CalendarDay'
import type { DateData } from 'react-native-calendars'

type Props = {
  month: number
  year: number
  monthsReports: ServiceReport[] | null
}

const WeekStripTeaser = ({ month, year, monthsReports }: Props) => {
  const theme = useTheme()
  const { startOfWeek } = usePreferences()
  const { serviceReports } = useServiceReport()
  const navigation = useNavigation<HomeTabStackNavigation>()

  const selectedMonth = useMemo(
    () => moment().month(month).year(year),
    [month, year]
  )
  const isCurrentMonth = useMemo(
    () => moment().isSame(selectedMonth, 'month'),
    [selectedMonth]
  )

  // Anchor the strip on the current week when viewing the current month;
  // otherwise anchor to the first week of the selected month. This keeps the
  // strip relevant to the user's "now" while still previewing other months.
  const weekAnchor = useMemo(() => {
    if (isCurrentMonth) return moment()
    return selectedMonth.clone().startOf('month')
  }, [isCurrentMonth, selectedMonth])

  const days = useMemo(() => {
    const startOfStripWeek = weekAnchor.clone().day(startOfWeek)
    // `.day()` can jump forward if startOfWeek is later in the week than the
    // anchor; pull back a full week so the strip still contains the anchor.
    if (startOfStripWeek.isAfter(weekAnchor)) {
      startOfStripWeek.subtract(7, 'days')
    }
    return Array.from({ length: 7 }, (_, i) =>
      startOfStripWeek.clone().add(i, 'days')
    )
  }, [startOfWeek, weekAnchor])

  // Reports covering every day in the strip — the week can cross a month
  // boundary, so we fetch the adjacent month too when needed. `monthsReports`
  // alone would miss logged activity on those out-of-month edges.
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

  const openSchedule = () => {
    navigation.navigate('Schedule', { month, year })
  }

  return (
    <GlassCard padding={20}>
      <View style={{ gap: 12 }}>
        <Button onPress={openSchedule} noTransform>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {isCurrentMonth ? i18n.t('thisWeek') : i18n.t('schedule')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('viewFullSchedule')}
              </Text>
              <IconButton
                icon={faChevronRight}
                size={12}
                iconStyle={{ color: theme.colors.textAlt }}
              />
            </View>
          </View>
        </Button>
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
                <Text
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
                  onPress={openSchedule}
                  height={50}
                />
              </View>
            )
          })}
        </View>
      </View>
    </GlassCard>
  )
}

export default WeekStripTeaser
