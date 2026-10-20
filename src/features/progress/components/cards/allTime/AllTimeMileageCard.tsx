import { MileageStatCard } from '@/features/progress/components/cards/MileageCard'
import type { AllTimeCardProps } from '@/features/progress/components/cards/types'

/** Every trip's distance driven in service, and its estimated cost. */
export default function AllTimeMileageCard({ size }: AllTimeCardProps) {
  return <MileageStatCard size={size} />
}
