import { View } from 'react-native'
import { useMemo } from 'react'
import { FlashList } from '@shopify/flash-list'
import moment from 'moment'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useServiceReport from '@/stores/serviceReport'
import i18n from '@/lib/locales'
import { getPlansIntersectingDay } from '@/lib/recurrence'
import PlanRow, { getPlanItemStartTime } from '@/components/PlanRow'
import type { PlanListItem } from '@/components/PlanRow'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'
import Card from '@/components/ui/Card'

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
    const planItems: PlanListItem[] = []

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

    // Sort chronologically so the list answers “what’s next?” first.
    // Within a day, keep earlier start times above later ones.
    return planItems.sort((a, b) => {
      const dayDiff =
        moment(a.date).startOf('day').valueOf() -
        moment(b.date).startOf('day').valueOf()
      if (dayDiff !== 0) return dayDiff
      return getPlanItemStartTime(a) - getPlanItemStartTime(b)
    })
  }, [month, year, dayPlans, recurringPlans])

  const handlePlanPress = (planItem: PlanListItem) => {
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

  const renderPlanItem = ({ item }: { item: PlanListItem }) => (
    <PlanRow
      item={item}
      dateDisplay='monthList'
      contextMonth={month}
      contextYear={year}
      onPress={() => handlePlanPress(item)}
    />
  )

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
