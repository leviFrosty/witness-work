import usePublisher from '@/hooks/usePublisher'
import useToday from '@/hooks/useToday'
import { serviceStreak, type ServiceStreak } from '@/lib/serviceStreak'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'

export default function useServiceStreak(): ServiceStreak {
  const streak = useRecordedServiceStreak()
  const override = usePreferences((state) => state.devStreakOverride)
  return override === null ? streak : { ...streak, count: override }
}

export function useRecordedServiceStreak(): ServiceStreak {
  const serviceReports = useServiceReport((state) => state.serviceReports)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const { streakKind } = usePublisher()
  const today = useToday()
  return serviceStreak(
    streakKind,
    { serviceReports, dayPlans, recurringPlans },
    today
  )
}
