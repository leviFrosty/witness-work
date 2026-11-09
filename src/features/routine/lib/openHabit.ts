import { analytics } from '@/lib/analytics'
import type { RootStackNavigation } from '@/types/rootStack'
import type { RoutineHabit } from '@/types/routine'

export function openHabit(
  navigation: RootStackNavigation,
  habit: RoutineHabit,
  from: 'home' | 'routine'
) {
  analytics.capture('routine_habit_opened', { habit, from })
  navigation.navigate('RoutineHabit', { habit })
}
