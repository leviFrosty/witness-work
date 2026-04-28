import { View } from 'react-native'
import { useMemo } from 'react'
import { FlashList } from '@shopify/flash-list'
import moment from 'moment'
import Text from './MyText'
import useTheme from '../contexts/theme'
import useServiceReport from '../stores/serviceReport'
import i18n from '../lib/locales'
import { DayPlan } from '../types/serviceReport'
import {
  RecurringPlan,
  getPlansIntersectingDay,
  getEffectiveStartTimeInMinutesForRecurringPlan,
} from '../lib/serviceReport'
import {
  DEFAULT_START_TIME_IN_MINUTES,
  getStartTimeInMinutes,
} from '../lib/normalizeDate'
import DayPlanRow from './DayPlanRow'
import RecurringPlanRow from './RecurringPlanRow'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../types/rootStack'
import Card from './Card'

interface PlanItem {
  type: 'day' | 'recurring'
  date: Date
  plan: DayPlan | RecurringPlan
}

interface MonthPlansListProps {
  month: number
  year: number
}

const MonthPlansList = ({ month, year }: MonthPlansListProps) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { dayPlans, recurringPlans } = useServiceReport()

  const monthPlans = useMemo(() => {
    const selectedMonth = moment().month(month).year(year)
    const daysInMonth = selectedMonth.daysInMonth()
    const planItems: PlanItem[] = []

    // Go through each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = selectedMonth.clone().date(day)

      // Check for day plans
      const dayPlan = dayPlans.find((plan) =>
        moment(plan.date).isSame(currentDate, 'day')
      )

      if (dayPlan) {
        planItems.push({
          type: 'day',
          date: currentDate.toDate(),
          plan: dayPlan,
        })
      }

      // Check for recurring plans
      const recurringPlansForDay = getPlansIntersectingDay(
        currentDate.toDate(),
        recurringPlans
      )

      recurringPlansForDay.forEach((recurringPlan) => {
        planItems.push({
          type: 'recurring',
          date: currentDate.toDate(),
          plan: recurringPlan,
        })
      })
    }

    // Sort newest day first; within a day, ascending by start time so 9 AM
    // appears above 2 PM.
    const planTime = (item: PlanItem): number => {
      if (item.type === 'day') {
        return getStartTimeInMinutes(item.plan as DayPlan)
      }
      return getEffectiveStartTimeInMinutesForRecurringPlan(
        item.plan as RecurringPlan,
        item.date
      )
    }
    return planItems.sort((a, b) => {
      const dayDiff = moment(b.date).unix() - moment(a.date).unix()
      if (dayDiff !== 0) return dayDiff
      return (
        (planTime(a) ?? DEFAULT_START_TIME_IN_MINUTES) -
        (planTime(b) ?? DEFAULT_START_TIME_IN_MINUTES)
      )
    })
  }, [month, year, dayPlans, recurringPlans])

  const handlePlanPress = (planItem: PlanItem) => {
    if (planItem.type === 'day') {
      navigation.navigate('PlanDay', {
        date: moment(planItem.date).toISOString(),
        existingDayPlanId: planItem.plan.id,
      })
    } else {
      navigation.navigate('PlanDay', {
        date: moment(planItem.date).toISOString(),
        existingRecurringPlanId: planItem.plan.id,
        recurringPlanDate: moment(planItem.date).toISOString(),
      })
    }
  }

  const renderPlanItem = ({ item }: { item: PlanItem }) => {
    return item.type === 'day' ? (
      <DayPlanRow
        plan={item.plan as DayPlan}
        date={item.date}
        onPress={() => handlePlanPress(item)}
      />
    ) : (
      <RecurringPlanRow
        plan={item.plan as RecurringPlan}
        date={item.date}
        onPress={() => handlePlanPress(item)}
      />
    )
  }

  if (monthPlans.length === 0) {
    return (
      <Card>
        <Text
          style={{
            textAlign: 'center',
            color: theme.colors.text,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('noPlansScheduledForThisMonth')}
        </Text>
      </Card>
    )
  }

  return (
    <View style={{ minHeight: 2 }}>
      <FlashList
        renderItem={renderPlanItem}
        data={monthPlans}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    </View>
  )
}

export default MonthPlansList
