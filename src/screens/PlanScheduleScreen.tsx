import { ScrollView, View } from 'react-native'
import Text from '../components/MyText'
import useTheme from '../contexts/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import i18n from '../lib/locales'
import Wrapper from '../components/layout/Wrapper'
import XView from '../components/layout/XView'
import { useCallback, useEffect, useMemo, useState } from 'react'
import moment from 'moment'
import { Calendar } from 'react-native-calendars'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import CalendarDay from '../components/CalendarDay'
import SimpleProgressBar from '../components/SimpleProgressBar'
import _ from 'lodash'
import CalendarKey from '../components/CalendarKey'
import useServiceReport from '../stores/serviceReport'
import usePublisher from '../hooks/usePublisher'
import {
  getPlansIntersectingDay,
  getServiceYearFromDate,
  serviceYearsDateRange,
} from '../lib/serviceReport'
import Header from '../components/layout/Header'
import Button from '../components/Button'
import IconButton from '../components/IconButton'
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import Card from '../components/Card'
import { RootStackParamList } from '../types/rootStack'

type PlanScheduleScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'PlanSchedule'
>

const PlanScheduleScreen = ({ route, navigation }: PlanScheduleScreenProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const [month, setMonth] = useState(route.params.month)
  const [year, setYear] = useState(route.params.year)
  const selectedMonth = moment().month(month).year(year)
  const monthToView = selectedMonth.format('YYYY-MM-DD')

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

  useEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          noInsets
          title={selectedMonth.format('MMMM YYYY')}
          buttonType='back'
        />
      ),
    })
  }, [
    selectedMonth,
    month,
    navigation,
    theme.colors.accent3,
    theme.colors.text,
    theme.colors.textInverse,
    year,
  ])

  return (
    <Wrapper
      style={{
        flex: 1,
        flexGrow: 1,
        justifyContent: 'space-between',
        paddingBottom: insets.bottom,
        paddingTop: 0,
      }}
    >
      <View style={{ flexGrow: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 15,
            paddingVertical: 10,
          }}
        >
          {selectedMonth.isAfter(moment(), 'month') ? (
            <Button
              onPress={() => handleArrowNavigate('back')}
              style={{
                borderColor: theme.colors.accent,
                borderWidth: 1,
                borderRadius: theme.numbers.borderRadiusLg,
                paddingHorizontal: 15,
                paddingVertical: 5,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  gap: 5,
                  alignItems: 'center',
                }}
              >
                <IconButton
                  icon={faArrowLeft}
                  size={15}
                  color={theme.colors.accent}
                />
                <Text
                  style={{
                    color: theme.colors.accent,
                    fontFamily: theme.fonts.semiBold,
                    textDecorationLine: 'underline',
                  }}
                >
                  {moment(selectedMonth).subtract(1, 'month').format('MMM')}
                </Text>
              </View>
            </Button>
          ) : (
            <View style={{ width: 50 }} />
          )}
          {(month !== moment().month() || year !== moment().year()) && (
            <Button
              style={{
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
          <Button
            onPress={() => handleArrowNavigate('forward')}
            style={{
              borderColor: theme.colors.accent,
              borderWidth: 1,
              borderRadius: theme.numbers.borderRadiusLg,
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: 5,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                  textDecorationLine: 'underline',
                }}
              >
                {moment(selectedMonth).add(1, 'month').format('MMM')}
              </Text>
              <IconButton
                icon={faArrowRight}
                size={15}
                color={theme.colors.accent}
              />
            </View>
          </Button>
        </View>
        <ScrollView
          contentInset={{
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
          contentContainerStyle={{
            paddingBottom: 200,
            gap: 10,
          }}
        >
          <View style={{ paddingHorizontal: 10 }}>
            <Card style={{ gap: 10 }}>
              <View style={{ gap: 4 }}>
                <Text
                  style={{
                    fontFamily: theme.fonts.bold,
                    fontSize: theme.fontSize('xl'),
                  }}
                >
                  {i18n.t('plannedHours')}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('timePlanned_description2')}
                </Text>
              </View>
              <XView style={{ flex: 1, gap: 10 }}>
                <MonthScheduleSection month={month} year={year} />
                <AnnualScheduleSection month={month} year={year} />
              </XView>
            </Card>
          </View>
          <View
            style={{ paddingHorizontal: 10, position: 'relative', gap: 10 }}
          >
            <Calendar
              key={monthToView}
              current={monthToView}
              disableMonthChange
              hideArrows
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onDayPress={(day: any) => {
                navigation.navigate('PlanDay', {
                  date: moment(day.dateString).toISOString(),
                })
              }}
              renderHeader={() => (
                <View style={{ width: '100%', gap: 10 }}>
                  <View style={{ gap: 4 }}>
                    <Text
                      style={{
                        fontSize: theme.fontSize('lg'),
                        fontFamily: theme.fonts.semiBold,
                      }}
                    >
                      {i18n.t('tapDayToSchedule')}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('sm'),
                      }}
                    >
                      {i18n.t('tapDayToSchedule_description')}
                    </Text>
                  </View>
                  <CalendarKey />
                </View>
              )}
              style={{
                borderRadius: theme.numbers.borderRadiusLg,
                paddingBottom: 10,
                paddingTop: 10,
                paddingLeft: 10,
                paddingRight: 10,
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              dayComponent={(props: any) => (
                <CalendarDay {...props} planMode={true} />
              )}
              theme={{
                backgroundColor: theme.colors.card,
                calendarBackground: theme.colors.card,
                dayTextColor: theme.colors.text,
                textDisabledColor: theme.colors.textAlt,
                textDayHeaderFontSize: theme.fontSize('md'),
                selectedDayBackgroundColor: theme.colors.accent,
                todayTextColor: theme.colors.text,
                todayBackgroundColor: theme.colors.accentTranslucent,
              }}
            />
          </View>
        </ScrollView>
      </View>
    </Wrapper>
  )
}

const AnnualScheduleSection = (props: { month: number; year: number }) => {
  const { month, year } = props
  const theme = useTheme()
  const { dayPlans, recurringPlans } = useServiceReport()
  const { annualGoalHours, hasAnnualGoal } = usePublisher()
  const serviceYear = getServiceYearFromDate(moment().month(month).year(year))

  const annualPlannedMinutes = useMemo(() => {
    const { minDate, maxDate } = serviceYearsDateRange(serviceYear)
    let minutes = 0
    const now = minDate.clone()

    while (now.isSameOrBefore(maxDate)) {
      const dayPlan = dayPlans.find((plan) =>
        moment(plan.date).isSame(now, 'day')
      )

      const recurringPlansForDay = getPlansIntersectingDay(
        now.toDate(),
        recurringPlans
      )

      const highestRecurringPlanForDay = recurringPlansForDay.sort(
        (a, b) => b.minutes - a.minutes
      )[0]

      if (dayPlan) {
        minutes += dayPlan.minutes
      } else if (highestRecurringPlanForDay) {
        minutes += highestRecurringPlanForDay.minutes
      }

      now.add(1, 'd')
    }

    return minutes
  }, [dayPlans, recurringPlans, serviceYear])

  const percentPlanned = annualPlannedMinutes / (annualGoalHours * 60)

  if (!hasAnnualGoal) {
    return null
  }

  return (
    <View style={{ gap: 5, flex: 1 }}>
      <XView style={{ justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('year')}
        </Text>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {`${_.round(
            annualPlannedMinutes / 60,
            1
          )} ${i18n.t('of')} ${annualGoalHours} ${i18n.t('hours')}`}
        </Text>
      </XView>
      <SimpleProgressBar
        percentage={percentPlanned}
        color={percentPlanned < 1 ? theme.colors.warn : theme.colors.accent}
      />
    </View>
  )
}

const MonthScheduleSection = (props: { month: number; year: number }) => {
  const theme = useTheme()
  const { dayPlans, recurringPlans } = useServiceReport()
  const { goalHours } = usePublisher()
  const plannedMinutes = useMemo(() => {
    const selectedMonth = moment().month(props.month).year(props.year)
    const dayOfMonth = selectedMonth.daysInMonth()

    let count = 0
    Array(dayOfMonth)
      .fill(1)
      .forEach((_, i) => {
        const day = selectedMonth.clone().date(i + 1)

        const dayPlan = dayPlans.find((plan) =>
          moment(plan.date).isSame(day, 'day')
        )

        const recurringPlansForDay = getPlansIntersectingDay(
          day.toDate(),
          recurringPlans
        )

        const highestRecurringPlanForDay = recurringPlansForDay.sort(
          (a, b) => b.minutes - a.minutes
        )[0]

        if (dayPlan) {
          count += dayPlan.minutes
        } else if (highestRecurringPlanForDay) {
          count += highestRecurringPlanForDay.minutes
        }
      })
    return count
  }, [props.month, props.year, dayPlans, recurringPlans])

  const percentPlanned = plannedMinutes / goalHours / 60
  return (
    <View style={{ gap: 5, flex: 1 }}>
      <XView style={{ justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('month')}
        </Text>
        <XView>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
            }}
          >
            {`${_.round(
              plannedMinutes / 60,
              1
            )} ${i18n.t('of')} ${goalHours} ${i18n.t('hours')}`}
          </Text>
        </XView>
      </XView>
      <SimpleProgressBar
        percentage={percentPlanned}
        color={percentPlanned < 1 ? theme.colors.warn : theme.colors.accent}
      />
    </View>
  )
}

export default PlanScheduleScreen
