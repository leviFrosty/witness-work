import useServiceReport from '@/stores/serviceReport'
import {
  buildScheduleDayIndex,
  type ScheduleDayIndex,
} from '@/features/plans/lib/scheduleDayIndex'

/** Store-wired {@link buildScheduleDayIndex}. */
export default function useScheduleDayIndex(): ScheduleDayIndex {
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  return buildScheduleDayIndex(serviceReports, dayPlans)
}
