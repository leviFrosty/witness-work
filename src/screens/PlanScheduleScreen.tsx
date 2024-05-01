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
import { RootStackParamList } from '../stacks/RootStack'
import CalendarDay from '../components/CalendarDay'
import SimpleProgressBar from '../components/SimpleProgressBar'
import CardWithTitle from '../components/CardWithTitle'
import _ from 'lodash'
import CalendarKey from '../components/CalendarKey'
import useServiceReport from '../stores/serviceReport'
import usePublisher from '../hooks/usePublisher'
import { getPlansIntersectingDay } from '../lib/serviceReport'
import Header from '../components/layout/Header'
import Button from '../components/Button'
import IconButton from '../components/IconButton'
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons'

type PlanScheduleScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'PlanSchedule'
>

const PlanScheduleScreen = ({ route, navigation }: PlanScheduleScreenProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { dayPlans, recurringPlans } = useServiceReport()
  const [month, setMonth] = useState(route.params.month)
  const [year, setYear] = useState(route.params.year)
  const selectedMonth = moment().month(month).year(year)
  const monthToView = selectedMonth.format('YYYY-MM-DD')
  const { goalHours } = usePublisher()

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

  const plannedMinutes = useMemo(() => {
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
  }, [selectedMonth, dayPlans, recurringPlans])

  const percentPlanned = plannedMinutes / goalHours / 60

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
            padding: 20,
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
            gap: 15,
          }}
        >
          <View
            style={{ flexDirection: 'column', gap: 5, paddingHorizontal: 10 }}
          >
            <CardWithTitle
              title={
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 5,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: theme.fontSize('xl'),
                      fontFamily: theme.fonts.bold,
                    }}
                  >
                    {i18n.t('monthSchedule')}
                  </Text>
                </View>
              }
            >
              <XView style={{ justifyContent: 'flex-end' }}>
                <XView>
                  <Text
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.textAlt,
                    }}
                  >
                    {`${i18n.t('planned')} ${_.round(
                      plannedMinutes / 60,
                      1
                    )} ${i18n.t('of')} ${goalHours} ${i18n.t('hours')}`}
                  </Text>
                </XView>
              </XView>
              <SimpleProgressBar
                percentage={percentPlanned}
                color={
                  percentPlanned < 1 ? theme.colors.warn : theme.colors.accent
                }
              />
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('xs'),
                }}
              >
                {i18n.t('timePlanned_description')}
              </Text>
            </CardWithTitle>
          </View>
          <View
            style={{ paddingHorizontal: 10, position: 'relative', gap: 10 }}
          >
            <Calendar
              key={monthToView}
              current={monthToView}
              disableMonthChange
              hideArrows
              onDayPress={(day) => {
                navigation.navigate('PlanDay', {
                  date: moment(day.dateString).toISOString(),
                })
              }}
              renderHeader={() => <CalendarKey />}
              style={{
                borderRadius: theme.numbers.borderRadiusLg,
                paddingBottom: 10,
                paddingTop: 10,
                paddingLeft: 10,
                paddingRight: 10,
              }}
              dayComponent={(props) => (
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
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('youCannotCreateAPlanForAPreviousDay')}
            </Text>
          </View>
        </ScrollView>
      </View>
    </Wrapper>
  )
}

export default PlanScheduleScreen