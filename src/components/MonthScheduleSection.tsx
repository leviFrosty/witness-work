import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import AheadOrBehindOfMonthSchedule from './AheadOrBehindOfSchedule'
import Text from './MyText'
import Button from './Button'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import { useMemo } from 'react'
import moment from 'moment'
import useServiceReport from '../stores/serviceReport'
import {
  getPlansIntersectingDay,
  plannedMinutesToCurrentDayForMonth,
} from '../lib/serviceReport'
import usePublisher from '../hooks/usePublisher'
import Circle from './Circle'
import XView from './layout/XView'
import { View } from 'react-native'
import _ from 'lodash'

type MonthScheduleSectionProps = {
  month: number
  year: number
}

export default function MonthScheduleSection(props: MonthScheduleSectionProps) {
  const { month, year } = props
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { dayPlans, recurringPlans } = useServiceReport()
  const selectedMonth = moment().month(month).year(year)
  const { goalHours } = usePublisher()

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

  const percentPlanned = plannedMinutes / 60 / goalHours

  const plannedMinutesToCurrentDay = useMemo(() => {
    return plannedMinutesToCurrentDayForMonth(
      month,
      year,
      dayPlans,
      recurringPlans
    )
  }, [dayPlans, month, recurringPlans, year])

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingTop: 10,
        gap: 15,
      }}
    >
      <View style={{ gap: 10 }}>
        {plannedMinutesToCurrentDay !== 0 && (
          <View style={{ gap: 3 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('today')}
            </Text>
            <AheadOrBehindOfMonthSchedule month={month} year={year} />
          </View>
        )}
        <View style={{ gap: 3 }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('planned')}
          </Text>
          <XView>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {_.round(plannedMinutes / 60, 1)} {i18n.t('of')}{' '}
              {_.round(goalHours, 1)} {i18n.t('hours')}
            </Text>
            <Circle
              color={
                !percentPlanned
                  ? theme.colors.textAlt
                  : percentPlanned >= 1
                    ? theme.colors.accent
                    : theme.colors.warn
              }
            />
          </XView>
          {percentPlanned < 1 && (
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('tryToPlanAtLeast100Percent')}
            </Text>
          )}
        </View>
      </View>
      <Button
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          borderColor: theme.colors.accent,
          borderWidth: 2,
          paddingVertical: 12,
          paddingHorizontal: 24,
          borderRadius: theme.numbers.borderRadiusSm,
        }}
        onPress={() =>
          navigation.navigate('PlanSchedule', {
            month,
            year,
          })
        }
      >
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
            textAlign: 'center',
          }}
        >
          {i18n.t('planSchedule')}
        </Text>
      </Button>
    </View>
  )
}
