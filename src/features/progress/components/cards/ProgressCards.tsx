import type { ReactNode, Ref } from 'react'
import type { View } from 'react-native'
import ReorderableLiftZone from '@/components/ui/reorderable/ReorderableLiftZone'
import { useReorderableDragging } from '@/components/ui/reorderable/context'
import type { ReorderScroller } from '@/components/ui/reorderable/useReorderScroller'
import { MONTH_CARDS, type ProgressCardId } from '@/lib/progressCards'
import type { RevealAboveSheet } from '@/hooks/useRevealAboveSheet'
import useProgressCards from '@/features/progress/hooks/useProgressCards'
import {
  PROGRESS_CARD_GROUPS,
  PROGRESS_CARDS,
  type ProgressCardDestination,
} from '@/features/progress/components/cards/progressCardRegistry'
import ProgressCardPressable from '@/features/progress/components/cards/ProgressCardPressable'
import ProgressCardGrid, {
  type ProgressCardEditStart,
} from '@/features/progress/components/cards/ProgressCardGrid'
import DaysCard from '@/features/progress/components/cards/DaysCard'
import DaysEditPreview, {
  DAYS_PREVIEW_HEIGHTS,
} from '@/features/progress/components/cards/DaysEditPreview'

export { PROGRESS_CARD_GAP } from '@/features/progress/components/cards/ProgressCardGrid'

type Props = {
  month: number
  year: number
  editing: boolean
  onStartEditing: (source: ProgressCardEditStart) => void
  /** Tapping empty space ends editing, as Done does. */
  onFinishEditing: () => void
  /** The Add Cards sheet is open (from here or the header's Add Cards). */
  adding: boolean
  onAddingChange: (adding: boolean) => void
  onNavigate: (destination: ProgressCardDestination) => void
  scroller: ReorderScroller
  onDragChange: (dragging: boolean) => void
  /** Cards this layout shows elsewhere, e.g. Days beside the cards. */
  exclude?: ProgressCardId[]
  /** Keeps a day picked in the full Days list above its sheet. */
  dayReveal?: RevealAboveSheet
  /** Each row of the Days list, by its date, e.g. to keep it in view. */
  dayRef?: (day: string) => Ref<View>
}

/**
 * While editing, the Days list stands in as a short preview, except while it's
 * held: a hold on its header outside edit mode lifts it straight into a drag,
 * and that drag's gesture lives in the full list's header.
 */
function DaysSlot({
  editing,
  preview,
  children,
}: {
  editing: boolean
  preview: ReactNode
  children: ReactNode
}) {
  const held = useReorderableDragging('days')
  return editing && !held ? preview : children
}

/** The User's cards under the month's report (see `ProgressCardGrid`). */
export default function ProgressCards({
  month,
  year,
  dayReveal,
  dayRef,
  onStartEditing,
  ...grid
}: Props) {
  const cards = useProgressCards(month, year)

  return (
    <ProgressCardGrid
      {...grid}
      cards={cards}
      ids={MONTH_CARDS.ids}
      sizes={MONTH_CARDS.sizes}
      meta={PROGRESS_CARDS}
      groups={PROGRESS_CARD_GROUPS}
      onStartEditing={onStartEditing}
      renderContent={(item) => {
        const { Component } = PROGRESS_CARDS[item.id]
        return <Component month={month} year={year} size={item.size} />
      }}
      renderOwn={(item) =>
        item.id === 'days' ? (
          <DaysSlot
            editing={grid.editing}
            preview={<DaysEditPreview size={item.size} />}
          >
            <DaysCard
              month={month}
              year={year}
              size={item.size}
              dayReveal={dayReveal}
              dayRef={dayRef}
              // Each day has a menu of its own, so only the header lifts the
              // list (`liftsByZone`).
              wrapEditTrigger={(header) => (
                <ReorderableLiftZone>
                  <ProgressCardPressable
                    onEdit={() => onStartEditing('card')}
                    fill={false}
                  >
                    {header}
                  </ProgressCardPressable>
                </ReorderableLiftZone>
              )}
            />
          </DaysSlot>
        ) : undefined
      }
      liftsByZone={(id) => id === 'days'}
      sizeHeight={(id, size) =>
        id === 'days' && size !== 'small' && size !== 'wide'
          ? DAYS_PREVIEW_HEIGHTS[size]
          : undefined
      }
    />
  )
}
