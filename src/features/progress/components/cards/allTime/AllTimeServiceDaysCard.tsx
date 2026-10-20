import { useAllTimeEntries } from '@/features/progress/hooks/usePeriodCardData'
import { ServiceDaysStatCard } from '@/features/progress/components/cards/ServiceDaysCard'
import type { AllTimeCardProps } from '@/features/progress/components/cards/types'

/** Every day with time, the average day out, and the longest one. */
export default function AllTimeServiceDaysCard({ size }: AllTimeCardProps) {
  return <ServiceDaysStatCard reports={useAllTimeEntries()} size={size} />
}
