import { useNavigation } from '@react-navigation/native'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import { analytics } from '@/lib/analytics'
import type { RootStackNavigation } from '@/types/rootStack'

/** Where "Plan today's route" was opened from. */
export type TodayRouteEntrySurface =
  | 'home_follow_ups'
  | 'home_day'
  | 'schedule_day'
  | 'schedule_inspector'

/**
 * Opens Today's Route and records which entry point led there, so we can see
 * which placements people actually find.
 */
export default function useOpenTodayRoute(surface: TodayRouteEntrySurface) {
  const navigation = useNavigation<RootStackNavigation>()
  const { hasAccess } = useFeatureAccess('routePlanning')
  return () => {
    analytics.capture('route_plan_entry_opened', {
      surface,
      supporter: hasAccess,
    })
    navigation.navigate('TodayRoute')
  }
}
