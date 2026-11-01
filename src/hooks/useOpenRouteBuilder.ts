import moment from 'moment'
import { useNavigation } from '@react-navigation/native'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import { analytics } from '@/lib/analytics'
import type { RootStackNavigation } from '@/types/rootStack'

export type RouteBuilderEntrySurface =
  | 'home_follow_ups'
  | 'home_day'
  | 'schedule_day'
  | 'schedule_inspector'
  | 'plan_menu'
  | 'day_menu'
  | 'contacts_map'

export default function useOpenRouteBuilder(surface: RouteBuilderEntrySurface) {
  const navigation = useNavigation<RootStackNavigation>()
  const { hasAccess } = useFeatureAccess('routePlanning')
  return (date?: Date, planId?: string) => {
    const later = !!date && !moment(date).isSame(moment(), 'day')
    analytics.capture('route_plan_entry_opened', {
      surface,
      supporter: hasAccess,
      future_day: later,
    })
    navigation.navigate(
      'TodayRoute',
      later || planId
        ? {
            ...(later && { date: moment(date).format('YYYY-MM-DD') }),
            ...(planId && { planId }),
          }
        : undefined
    )
  }
}
