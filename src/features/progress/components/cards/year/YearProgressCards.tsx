import type { ComponentProps } from 'react'
import { YEAR_CARDS } from '@/lib/progressCards'
import useYearProgressCards from '@/features/progress/hooks/useYearProgressCards'
import ProgressCardGrid from '@/features/progress/components/cards/ProgressCardGrid'
import {
  YEAR_CARD_GROUPS,
  YEAR_PROGRESS_CARDS,
} from '@/features/progress/components/cards/year/yearCardRegistry'

type GridProps = ComponentProps<typeof ProgressCardGrid>

type Props = Pick<
  GridProps,
  | 'editing'
  | 'onStartEditing'
  | 'onFinishEditing'
  | 'adding'
  | 'onAddingChange'
  | 'onNavigate'
  | 'scroller'
  | 'onDragChange'
> & {
  serviceYear: number
}

export default function YearProgressCards({ serviceYear, ...grid }: Props) {
  const cards = useYearProgressCards(serviceYear)
  return (
    <ProgressCardGrid
      {...grid}
      cards={cards}
      ids={YEAR_CARDS.ids}
      sizes={YEAR_CARDS.sizes}
      meta={YEAR_PROGRESS_CARDS}
      groups={YEAR_CARD_GROUPS}
      renderContent={(item) => {
        const { Component } = YEAR_PROGRESS_CARDS[item.id]
        return <Component serviceYear={serviceYear} size={item.size} />
      }}
    />
  )
}
