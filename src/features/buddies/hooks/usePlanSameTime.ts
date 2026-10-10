import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import { analytics } from '@/lib/analytics'
import type { RootStackNavigation } from '@/types/rootStack'
import type { BuddyCardDay } from '@/features/buddies/lib/schemas'

/** Where "Plan the Same Time" was chosen, for `buddy_plan_same_time_opened`. */
type Source = 'buddy_detail' | 'buddy_plans_for_day'

/**
 * Opens a new Plan seeded with a buddy's day, start time, and length. Nothing
 * is shared or linked; it's my own Plan that happens to match theirs.
 */
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
            : date.clone().startOf('day').add(plan.s, 'minutes').toISOString(),
        // A buddy's Plan with no start time is anytime.
        anytime: plan.s === undefined,
        minutes: plan.m,
      },
    })
  }
}
