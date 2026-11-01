import i18n from '@/lib/locales'
import { serviceYearFocusMonth } from '@/lib/roleHistory'
import YearPaceCard from '@/features/progress/components/cards/YearPaceCard'
import type { YearCardProps } from '@/features/progress/components/cards/types'

export default function YearNeededCard({ serviceYear, size }: YearCardProps) {
  const focus = serviceYearFocusMonth(serviceYear)
  return (
    <YearPaceCard
      month={focus.month}
      year={focus.year}
      size={size}
      title={i18n.t('progressCards.year.needed.title')}
    />
  )
}
