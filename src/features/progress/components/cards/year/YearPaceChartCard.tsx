import usePublisher from '@/hooks/usePublisher'
import { serviceYearFocusMonth } from '@/lib/roleHistory'
import ServiceYearPaceCard from '@/features/progress/components/ServiceYearPaceCard'
import useServiceYearPace from '@/features/progress/hooks/useServiceYearPace'
import type { YearCardProps } from '@/features/progress/components/cards/types'

export default function YearPaceChartCard({ serviceYear }: YearCardProps) {
  const data = useServiceYearPace(serviceYear)
  const { milestones } = usePublisher(serviceYearFocusMonth(serviceYear))
  return <ServiceYearPaceCard data={data} milestones={milestones} />
}
