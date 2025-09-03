import { View } from 'react-native'
import { useMemo } from 'react'
import moment from 'moment'
import useTheme from '../contexts/theme'
import useServiceReport from '../stores/serviceReport'
import usePublisher from '../hooks/usePublisher'
import i18n from '../lib/locales'
import Text from './MyText'
import Card from './Card'
import XView from './layout/XView'
import Circle from './Circle'
import { getPlansIntersectingDay } from '../lib/serviceReport'
import { useFormattedMinutes } from '../lib/minutes'
import _ from 'lodash'

type PlanningProgressCardProps = {
  month: number
  year: number
}

export default function PlanningProgressCard({
  month,
  year,
}: PlanningProgressCardProps) {
  const theme = useTheme()
  const { dayPlans, recurringPlans } = useServiceReport()
  const { goalHours } = usePublisher()
  const selectedMonth = moment().month(month).year(year)
  const totalDaysInMonth = selectedMonth.daysInMonth()

  // Calculate total planned minutes for the entire month
  const totalPlannedMinutes = useMemo(() => {
    let count = 0
    Array(totalDaysInMonth)
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
  }, [selectedMonth, dayPlans, recurringPlans, totalDaysInMonth])

  // Calculate days that have been planned (have some plan)
  const plannedDays = useMemo(() => {
    let count = 0
    Array(totalDaysInMonth)
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

        if (dayPlan || recurringPlansForDay.length > 0) {
          count++
        }
      })
    return count
  }, [selectedMonth, dayPlans, recurringPlans, totalDaysInMonth])

  const totalPlannedMinutesWithFormat = useFormattedMinutes(totalPlannedMinutes)
  const percentOfGoalPlanned = totalPlannedMinutes / 60 / goalHours

  return (
    <Card style={{ gap: 15 }}>
      <View style={{ gap: 10 }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('lg'),
            color: theme.colors.text,
          }}
        >
          Planning {i18n.t('progress')}
        </Text>

        {/* Progress Bar */}
        <View
          style={{
            gap: 3,
            backgroundColor: theme.colors.card,
            borderRadius: theme.numbers.borderRadiusSm,
            padding: 10,
          }}
        >
          <View
            style={{
              height: 20,
              backgroundColor: theme.colors.background,
              borderRadius: theme.numbers.borderRadiusSm,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${Math.min(percentOfGoalPlanned * 100, 100)}%`,
                backgroundColor:
                  percentOfGoalPlanned >= 1
                    ? theme.colors.accent
                    : percentOfGoalPlanned >= 0.5
                      ? theme.colors.warn
                      : theme.colors.error,
                borderTopLeftRadius: theme.numbers.borderRadiusSm,
                borderBottomLeftRadius: theme.numbers.borderRadiusSm,
                borderTopRightRadius:
                  percentOfGoalPlanned >= 1 ? theme.numbers.borderRadiusSm : 0,
                borderBottomRightRadius:
                  percentOfGoalPlanned >= 1 ? theme.numbers.borderRadiusSm : 0,
              }}
            />
          </View>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
              textAlign: 'right',
            }}
          >
            {Math.round(percentOfGoalPlanned * 100)}% {i18n.t('of')} goal{' '}
            {i18n.t('planned')}
          </Text>
        </View>

        <XView style={{ justifyContent: 'space-between' }}>
          <Text
            style={{
              fontFamily: theme.fonts.medium,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            Total {i18n.t('planned')}
          </Text>
          <XView style={{ gap: 5 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {totalPlannedMinutesWithFormat.formatted} {i18n.t('of')}{' '}
              {_.round(goalHours, 1)} {i18n.t('hours')}
            </Text>
            <Circle
              color={
                totalPlannedMinutes === 0
                  ? theme.colors.textAlt
                  : percentOfGoalPlanned >= 1
                    ? theme.colors.accent
                    : theme.colors.error
              }
            />
          </XView>
        </XView>

        {percentOfGoalPlanned < 1 && (
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
              fontStyle: 'italic',
            }}
          >
            {i18n.t('tryToPlanAtLeast100Percent')}
          </Text>
        )}
      </View>
    </Card>
  )
}
