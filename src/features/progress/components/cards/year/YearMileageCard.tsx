import { periodContaining } from '@/lib/mileage/calc'
import { serviceYearBounds } from '@/lib/serviceYear'
import { MileageStatCard } from '@/features/progress/components/cards/MileageCard'
import type { YearCardProps } from '@/features/progress/components/cards/types'

export default function YearMileageCard({ serviceYear, size }: YearCardProps) {
  return (
    <MileageStatCard
      period={periodContaining('year', serviceYearBounds(serviceYear).start)}
      size={size}
    />
  )
}
