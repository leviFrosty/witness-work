import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useNavigation as useRootNavigation } from '@react-navigation/native'
import moment from 'moment'
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import { FlashList } from '@shopify/flash-list'

import useServiceReport from '../stores/serviceReport'
import useTheme from '../contexts/theme'
import { getMonthsReports } from '../lib/serviceReport'
import { RootStackNavigation } from '../types/rootStack'
import { HomeTabStackParamList } from '../types/homeStack'
import { ServiceReport } from '../types/serviceReport'

import GlassCard from '../components/GlassCard'
import CalendarHeader, { CalendarViewMode } from '../components/CalendarHeader'
import CalendarKey from '../components/CalendarKey'
import MonthTimeReportsCalendar from '../components/MonthTimeReportsCalendar'
import MonthScheduleSection from '../components/MonthScheduleSection'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '../components/SelectedDateSheet'
import Card from '../components/Card'
import Button from '../components/Button'
import IconButton from '../components/IconButton'
import Text from '../components/MyText'
import XView from '../components/layout/XView'
import TimeReportRow from '../components/TimeReportRow'
import i18n from '../lib/locales'

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Schedule'>

const ScheduleScreen = ({ route }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const rootNavigation = useRootNavigation<RootStackNavigation>()
  const { serviceReports } = useServiceReport()

  const [year, setYear] = useState(route.params?.year ?? moment().year())
  const [month, setMonth] = useState(route.params?.month ?? moment().month())
  const [calendarViewMode, setCalendarViewMode] =
    useState<CalendarViewMode>('planned')
  const [selectedDateSheet, setSelectedDateSheet] =
    useState<SelectedDateSheetState>({
      open: false,
      date: new Date(),
    })

  const pendingNavigation = useRef<(() => void) | null>(null)
  const selectedMonth = useMemo(
    () => moment().month(month).year(year),
    [month, year]
  )
  const isCurrentMonth = month === moment().month() && year === moment().year()

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  const handleAddTime = useCallback(() => {
    pendingNavigation.current = () => {
      rootNavigation.navigate('Add Time', {
        date: selectedDateSheet.date.toISOString(),
      })
    }
  }, [rootNavigation, selectedDateSheet.date])

  const handlePlanDay = useCallback(() => {
    pendingNavigation.current = () => {
      rootNavigation.navigate('PlanDay', {
        date: selectedDateSheet.date.toISOString(),
      })
    }
  }, [rootNavigation, selectedDateSheet.date])

  const handleNavigateToPlanDay = useCallback(
    (existingDayPlanId: string) => {
      pendingNavigation.current = () => {
        rootNavigation.navigate('PlanDay', {
          date: selectedDateSheet.date.toISOString(),
          existingDayPlanId,
        })
      }
    },
    [rootNavigation, selectedDateSheet.date]
  )

  const handleNavigateToRecurringPlan = useCallback(
    (existingRecurringPlanId: string, recurringPlanDate: string) => {
      pendingNavigation.current = () => {
        rootNavigation.navigate('PlanDay', {
          date: selectedDateSheet.date.toISOString(),
          existingRecurringPlanId,
          recurringPlanDate,
        })
      }
    },
    [rootNavigation, selectedDateSheet.date]
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
    if (!selectedDateSheet.open && pendingNavigation.current) {
      const callback = pendingNavigation.current
      pendingNavigation.current = null
      setTimeout(callback, 125)
    }
  }, [selectedDateSheet.open])

  const handleArrowNavigate = useCallback(
    (direction: 'forward' | 'back') => {
      if (direction === 'forward') {
        if (month === 11) {
          setMonth(0)
          setYear(year + 1)
        } else {
          setMonth(month + 1)
        }
      } else {
        if (month === 0) {
          setMonth(11)
          setYear(year - 1)
        } else {
          setMonth(month - 1)
        }
      }
    },
    [month, year]
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 15,
          paddingHorizontal: 15,
          paddingBottom: insets.bottom + 40,
          gap: 15,
        }}
      >
        <XView
          style={{
            justifyContent: 'space-between',
          }}
        >
          <Button
            onPress={() => handleArrowNavigate('back')}
            style={navButtonStyle(theme)}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: 5,
                alignItems: 'center',
              }}
            >
              <IconButton icon={faArrowLeft} size={15} />
              <Text style={{ color: theme.colors.textAlt }}>
                {moment(selectedMonth).subtract(1, 'month').format('MMM')}
              </Text>
            </View>
          </Button>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {selectedMonth.format('MMMM YYYY')}
          </Text>
          <Button
            onPress={() => handleArrowNavigate('forward')}
            style={navButtonStyle(theme)}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: 5,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: theme.colors.textAlt }}>
                {moment(selectedMonth).add(1, 'month').format('MMM')}
              </Text>
              <IconButton icon={faArrowRight} size={15} />
            </View>
          </Button>
        </XView>
        {!isCurrentMonth && (
          <Button
            style={{
              alignSelf: 'center',
              backgroundColor: theme.colors.accentTranslucent,
              paddingVertical: 5,
              paddingHorizontal: 15,
              borderRadius: theme.numbers.borderRadiusSm,
            }}
            onPress={() => {
              setYear(moment().year())
              setMonth(moment().month())
            }}
          >
            <Text style={{ textDecorationLine: 'underline' }}>
              {i18n.t('today')}
            </Text>
          </Button>
        )}
        <GlassCard>
          <CalendarHeader
            viewMode={calendarViewMode}
            onChangeViewMode={setCalendarViewMode}
          />
          <CalendarKey />
          <View style={{ marginTop: 4 }}>
            <MonthTimeReportsCalendar
              month={month}
              year={year}
              monthsReports={thisMonthsReports}
              setSheet={setSelectedDateSheet}
              viewMode={calendarViewMode}
            />
          </View>
          <MonthScheduleSection month={month} year={year} />
        </GlassCard>
        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: theme.colors.textAlt,
              textTransform: 'uppercase',
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              letterSpacing: 0.5,
            }}
          >
            {i18n.t('entries')}
          </Text>
          <View style={{ gap: 10, minHeight: 10 }}>
            <FlashList
              scrollEnabled={false}
              data={
                thisMonthsReports
                  ? [...thisMonthsReports].sort((a, b) =>
                      moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
                    )
                  : undefined
              }
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => <TimeReportRow report={item} />}
              ListEmptyComponent={
                <Card>
                  <Text>{i18n.t('noReportsThisMonthYet')}</Text>
                </Card>
              }
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
      <SelectedDateSheet
        sheet={selectedDateSheet}
        setSheet={setSelectedDateSheet}
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

const navButtonStyle = (theme: ReturnType<typeof useTheme>) => ({
  borderColor: theme.colors.border,
  borderWidth: 1,
  borderRadius: theme.numbers.borderRadiusLg,
  paddingHorizontal: 15,
  paddingVertical: 5,
})

export default ScheduleScreen
