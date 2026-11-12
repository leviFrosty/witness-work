import { useRef, useState } from 'react'
import { View } from 'react-native'
import AdaptiveSplitScrollView from '@/components/ui/layout/AdaptiveSplitScrollView'
import type { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import ReorderableContainer from '@/components/ui/reorderable/ReorderableContainer'
import ReorderableItem from '@/components/ui/reorderable/ReorderableItem'
import useReorderScroller from '@/components/ui/reorderable/useReorderScroller'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import type { HideBarsScrollProps } from '@/hooks/useHideBarsOnScroll'
import useTabReselect from '@/hooks/useTabReselect'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import usePublisher from '@/hooks/usePublisher'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import i18n from '@/lib/locales'

import YearMilestoneCard from '@/components/YearMilestoneCard'
import YearTotalCard from '@/features/progress/components/YearTotalCard'
import YearCategoryBreakdownSection from '@/features/progress/components/YearCategoryBreakdownSection'
import { serviceYearFocusMonth } from '@/lib/roleHistory'
import YearProgressCards, {
  MonthsEditTrigger,
} from '@/features/progress/components/cards/year/YearProgressCards'
import YearMonthsCard from '@/features/progress/components/cards/year/YearMonthsCard'
import { YEAR_PROGRESS_CARDS } from '@/features/progress/components/cards/year/yearCardRegistry'
import RestWhileEditing from '@/features/progress/components/cards/RestWhileEditing'
import {
  PROGRESS_CARD_GAP,
  type ProgressCardEditStart,
} from '@/features/progress/components/cards/ProgressCardGrid'
import type { ProgressCardDestination } from '@/features/progress/components/cards/progressCardRegistry'
import useYearProgressCards from '@/features/progress/hooks/useYearProgressCards'

interface ProgressYearTabProps {
  year: number

  onAdjustMilestones: () => void

  onMonthPress: (month: number, year: number) => void

  scrollBars?: HideBarsScrollProps

  editing: boolean
  onStartEditing: (source: ProgressCardEditStart) => void
  onFinishEditing: () => void

  adding: boolean
  onAddingChange: (adding: boolean) => void
  onNavigate: (destination: ProgressCardDestination) => void
}

const ProgressYearTab = ({
  year,
  onAdjustMilestones,
  onMonthPress,
  scrollBars,
  editing,
  onStartEditing,
  onFinishEditing,
  adding,
  onAddingChange,
  onNavigate,
}: ProgressYearTabProps) => {
  const insets = useSafeAreaInsets()
  const { isWide, hasBottomBar } = useAdaptiveLayout()
  const scrollRef = useRef<KeyboardAwareScrollView>(null)
  const scroller = useReorderScroller(scrollRef, {
    obscuredBottom: hasBottomBar ? insets.bottom + TAB_BAR_HEIGHT : 0,
  })
  const [dragging, setDragging] = useState(false)

  useTabReselect(() => scrollRef.current?.scrollToPosition(0, 0, true))

  const { hasAnnualGoal } = usePublisher(serviceYearFocusMonth(year - 1))
  const cards = useYearProgressCards(year - 1)

  const monthsBeside =
    isWide && cards.shown.some((item) => item.id === 'months')
  const monthsTitle = YEAR_PROGRESS_CARDS.months.title()

  return (
    <AdaptiveSplitScrollView
      scrollBars={scrollBars}
      paddingTop={0}
      paddingBottom={insets.bottom + (hasBottomBar ? 100 : 30)}
      leadingReorder={{ scrollRef, scroller, scrollEnabled: !dragging }}
      leading={
        <View style={{ gap: 24 }}>
          <RestWhileEditing editing={editing} onFinishEditing={onFinishEditing}>
            {hasAnnualGoal ? (
              <YearMilestoneCard
                year={year}
                onAdjustMilestones={onAdjustMilestones}
                categoriesSlot={<YearCategoryBreakdownSection year={year} />}
                part='summary'
              />
            ) : (
              <YearTotalCard
                year={year}
                categoriesSlot={<YearCategoryBreakdownSection year={year} />}
              />
            )}
          </RestWhileEditing>
          <YearProgressCards
            serviceYear={year - 1}
            onAdjustMilestones={onAdjustMilestones}
            onMonthPress={onMonthPress}
            monthsBeside={monthsBeside}
            editing={editing}
            onStartEditing={onStartEditing}
            onFinishEditing={onFinishEditing}
            adding={adding}
            onAddingChange={onAddingChange}
            onNavigate={onNavigate}
            scroller={scroller.scroller}
            onDragChange={setDragging}
          />
        </View>
      }
      trailing={
        monthsBeside ? (
          <ReorderableContainer
            editing={editing}
            onMove={() => {}}
            onLiftToEdit={() => onStartEditing('card')}
            onBackgroundPress={onFinishEditing}
            style={{
              padding: PROGRESS_CARD_GAP / 2,
              paddingTop: 10 + (editing ? 8 : 0),
            }}
          >
            <ReorderableItem
              id='months'
              movable={false}
              liftOutsideEditing='zone'
              onRemove={() => cards.remove('months')}
              removeLabel={i18n.t('progressCards.removeA11y', {
                card: monthsTitle,
              })}
              accessibilityLabel={monthsTitle}
              accessibilityActions={[
                { name: 'remove', label: i18n.t('progressCards.removeCard') },
              ]}
              onAccessibilityAction={(name) => {
                if (name === 'remove') cards.remove('months')
              }}
            >
              <View style={{ paddingTop: editing ? 16 : 0 }}>
                <YearMonthsCard
                  serviceYear={year - 1}
                  size='full'
                  onMonthPress={onMonthPress}
                  wrapHeader={(header) => (
                    <MonthsEditTrigger
                      header={header}
                      onEdit={() => onStartEditing('card')}
                    />
                  )}
                />
              </View>
            </ReorderableItem>
          </ReorderableContainer>
        ) : null
      }
    />
  )
}

export default ProgressYearTab
