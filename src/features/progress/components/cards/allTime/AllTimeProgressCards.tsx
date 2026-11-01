import type { ComponentProps } from 'react'
import { ALL_TIME_CARDS } from '@/lib/progressCards'
import useAllTimeProgressCards from '@/features/progress/hooks/useAllTimeProgressCards'
import ProgressCardGrid from '@/features/progress/components/cards/ProgressCardGrid'
import {
  ALL_TIME_CARD_GROUPS,
  ALL_TIME_PROGRESS_CARDS,
} from '@/features/progress/components/cards/allTime/allTimeCardRegistry'

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
>

export default function AllTimeProgressCards(grid: Props) {
  const cards = useAllTimeProgressCards()
  return (
    <ProgressCardGrid
      {...grid}
      cards={cards}
      ids={ALL_TIME_CARDS.ids}
      sizes={ALL_TIME_CARDS.sizes}
      meta={ALL_TIME_PROGRESS_CARDS}
      groups={ALL_TIME_CARD_GROUPS}
      renderContent={(item) => {
        const { Component } = ALL_TIME_PROGRESS_CARDS[item.id]
        return <Component size={item.size} />
      }}
    />
  )
}
