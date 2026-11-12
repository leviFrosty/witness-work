import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { YEAR_CARDS } from '@/lib/progressCards'
import i18n from '@/lib/locales'
import ReorderableLiftZone from '@/components/ui/reorderable/ReorderableLiftZone'
import { useReorderableDragging } from '@/components/ui/reorderable/context'
import YearMilestoneCard from '@/components/YearMilestoneCard'
import useYearProgressCards from '@/features/progress/hooks/useYearProgressCards'
import ProgressCardGrid from '@/features/progress/components/cards/ProgressCardGrid'
import ProgressCardPressable from '@/features/progress/components/cards/ProgressCardPressable'
import DaysEditPreview, {
  DAYS_PREVIEW_HEIGHTS,
} from '@/features/progress/components/cards/DaysEditPreview'
import YearMonthsCard from '@/features/progress/components/cards/year/YearMonthsCard'
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
  onAdjustMilestones: () => void
  onMonthPress: (month: number, year: number) => void

  monthsBeside: boolean
}

function MonthsSlot({
  editing,
  preview,
  children,
}: {
  editing: boolean
  preview: ReactNode
  children: ReactNode
}) {
  const held = useReorderableDragging('months')
  return editing && !held ? preview : children
}

export function MonthsEditTrigger({
  header,
  onEdit,
}: {
  header: ReactElement
  onEdit: () => void
}) {
  return (
    <ReorderableLiftZone>
      <ProgressCardPressable onEdit={onEdit} fill={false}>
        {header}
      </ProgressCardPressable>
    </ReorderableLiftZone>
  )
}

export default function YearProgressCards({
  serviceYear,
  onAdjustMilestones,
  onMonthPress,
  monthsBeside,
  onStartEditing,
  ...grid
}: Props) {
  const cards = useYearProgressCards(serviceYear)
  return (
    <ProgressCardGrid
      {...grid}
      onStartEditing={onStartEditing}
      cards={cards}
      ids={YEAR_CARDS.ids}
      sizes={YEAR_CARDS.sizes}
      meta={YEAR_PROGRESS_CARDS}
      groups={YEAR_CARD_GROUPS}
      exclude={monthsBeside ? ['months'] : []}
      renderContent={(item) => {
        if (item.id === 'milestones') {
          return (
            <YearMilestoneCard
              year={serviceYear + 1}
              part='milestones'
              onAdjustMilestones={onAdjustMilestones}
            />
          )
        }
        const { Component } = YEAR_PROGRESS_CARDS[item.id]
        return Component ? (
          <Component serviceYear={serviceYear} size={item.size} />
        ) : null
      }}
      renderOwn={(item) =>
        item.id === 'months' ? (
          <MonthsSlot
            editing={grid.editing}
            preview={
              <DaysEditPreview
                size={item.size}
                icon={YEAR_PROGRESS_CARDS.months.icon}
                title={YEAR_PROGRESS_CARDS.months.title()}
                fullCaption={i18n.t('progressCards.year.months.fullCaption')}
                compactCaption={i18n.t(
                  'progressCards.year.months.compactCaption'
                )}
              />
            }
          >
            <YearMonthsCard
              serviceYear={serviceYear}
              size={item.size}
              onMonthPress={onMonthPress}
              wrapHeader={(header) => (
                <MonthsEditTrigger
                  header={header}
                  onEdit={() => onStartEditing('card')}
                />
              )}
            />
          </MonthsSlot>
        ) : undefined
      }
      liftsByZone={(id) => id === 'months'}
      sizeHeight={(id, size) =>
        id === 'months' && (size === 'compact' || size === 'full')
          ? DAYS_PREVIEW_HEIGHTS[size]
          : undefined
      }
    />
  )
}
