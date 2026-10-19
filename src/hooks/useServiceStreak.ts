import usePublisher from '@/hooks/usePublisher'
import useToday from '@/hooks/useToday'
import { serviceStreak, type ServiceStreak } from '@/lib/serviceStreak'
import { useServiceReport } from '@/stores/serviceReport'

/**
 * The User's Service Streak: planned days kept, or months in service for the
 * Kingdom Publisher (`streakKind`).
 */
export default function useServiceStreak(): ServiceStreak {
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
