import ProjectedTotalCard from '@/components/ProjectedTotalCard'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

/** The month's Projected Total: logged time plus what's still planned. */
export default function ProjectedCard({ month, year }: ProgressCardProps) {
  return <ProjectedTotalCard scope={{ kind: 'month', month, year }} />
}
