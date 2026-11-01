import ProjectedTotalCard from '@/components/ProjectedTotalCard'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

export default function ProjectedCard({ month, year }: ProgressCardProps) {
  return <ProjectedTotalCard scope={{ kind: 'month', month, year }} />
}
