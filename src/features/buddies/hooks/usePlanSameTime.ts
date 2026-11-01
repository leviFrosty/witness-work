import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import { analytics } from '@/lib/analytics'
import { atMinutesOfDay } from '@/lib/normalizeDate'
import type { RootStackNavigation } from '@/types/rootStack'
import type { BuddyCardDay } from '@/features/buddies/lib/schemas'

type Source = 'buddy_detail' | 'buddy_plans_for_day'

export default function usePlanSameTime(source: Source) {
  const navigation = useNavigation<RootStackNavigation>()

  return (day: string, plan: BuddyCardDay['p'][number]) => {
    const date = moment(day, 'YYYY-MM-DD')
    analytics.capture('buddy_plan_same_time_opened', {
      source,
      has_start_time: plan.s !== undefined,
    })
    navigation.navigate('PlanDay', {
      date: date.clone().hour(12).toISOString(),
      prefill: {
        startTime:
          plan.s === undefined
            ? undefined
            : atMinutesOfDay(date, plan.s).toISOString(),

        anytime: plan.s === undefined,
        minutes: plan.m,
      },
    })
  }
}
