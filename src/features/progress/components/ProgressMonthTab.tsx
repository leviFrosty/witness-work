import { ReactNode, useMemo, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import useServiceReport from '@/stores/serviceReport'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useRevealAboveSheet from '@/hooks/useRevealAboveSheet'
import type { HideBarsScrollProps } from '@/hooks/useHideBarsOnScroll'
import useTabReselect from '@/hooks/useTabReselect'
import useScrollAnchor from '@/hooks/useScrollAnchor'
import { getMonthsReports } from '@/lib/serviceReport'
import { transparentToScreenReaders } from '@/lib/screenReader'

import MonthReport from '@/features/service-reports/components/MonthReport'
import FoldSplit from '@/components/ui/layout/FoldSplit'
import SwipeMonthNavigator from '@/components/SwipeMonthNavigator'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import useProgressCards from '@/features/progress/hooks/useProgressCards'
import ReorderableContainer from '@/components/ui/reorderable/ReorderableContainer'
import ReorderableItem from '@/components/ui/reorderable/ReorderableItem'
import ReorderableLiftZone from '@/components/ui/reorderable/ReorderableLiftZone'
import useReorderScroller from '@/components/ui/reorderable/useReorderScroller'
import i18n from '@/lib/locales'
import ProgressCards, {
  PROGRESS_CARD_GAP,
} from '@/features/progress/components/cards/ProgressCards'
import DaysCard from '@/features/progress/components/cards/DaysCard'
import ProgressCardPressable from '@/features/progress/components/cards/ProgressCardPressable'
import { PROGRESS_CARDS } from '@/features/progress/components/cards/progressCardRegistry'
import type { ProgressCardDestination } from '@/features/progress/components/cards/progressCardRegistry'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

interface ProgressMonthTabProps {
  month: number
  year: number
  onSwipeForward: () => void
  onSwipeBack: () => void

  editing: boolean
  onStartEditing: (source: 'card' | 'add' | 'footer') => void
  onFinishEditing: () => void

  adding: boolean
  onAddingChange: (adding: boolean) => void
  onNavigate: (destination: ProgressCardDestination) => void

  scrollBars?: HideBarsScrollProps

  header?: ReactNode
}

export function useDaysBeside(month: number, year: number) {
  const { isWide } = useAdaptiveLayout()
  const cards = useProgressCards(month, year)
  return isWide && cards.shown.some((item) => item.id === 'days')
}

const ProgressMonthTab = ({
  month,
  year,
  onSwipeForward,
  onSwipeBack,
  editing,
  onStartEditing,
  onFinishEditing,
  adding,
  onAddingChange,
  onNavigate,
  scrollBars,
  header,
}: ProgressMonthTabProps) => {
  const insets = useSafeAreaInsets()
  const { isWide, hasBottomBar, contentMaxWidth } = useAdaptiveLayout()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const cards = useProgressCards(month, year)

  const dayReveal = useRevealAboveSheet()
  const [dragging, setDragging] = useState(false)

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  const days = cards.shown.find((item) => item.id === 'days')
  const daysBeside = isWide && days !== undefined
  const foldColumn = useFoldColumn(daysBeside ? null : 720)

  const ownScrollRef = useRef<KeyboardAwareScrollView>(null)
  const leadingRef = daysBeside ? ownScrollRef : dayReveal.scrollRef
  const leading = useReorderScroller(leadingRef, {
    obscuredBottom: hasBottomBar ? insets.bottom + TAB_BAR_HEIGHT : 0,
  })
  const paddingBottom = insets.bottom + (hasBottomBar ? 100 : 30)

  const anchor = useScrollAnchor(daysBeside)
  const trailingFrame = useRef<View>(null)
  const leadingAnchor = anchor.scroll('leading', leadingRef, leading.frameRef)
  const trailingAnchor = anchor.scroll(
    'trailing',
    dayReveal.scrollRef,
    trailingFrame
  )
  const dayRef = (day: string) =>
    anchor.anchorRef(`day:${day}`, daysBeside ? 'trailing' : 'leading')

  useTabReselect(() => {
    anchor.reset()
    leadingRef.current?.scrollToPosition(0, 0, true)
  })

  const report = (
    <Pressable
      disabled={!editing}
      onPress={onFinishEditing}
      {...transparentToScreenReaders}
      style={{ opacity: editing ? 0.4 : 1 }}
    >
      <View pointerEvents={editing ? 'none' : 'auto'}>
        <MonthReport
          month={month}
          year={year}
          monthsReports={thisMonthsReports}
          showReportButton
          hideTitle
          allowGoalEditing
        />
      </View>
    </Pressable>
  )

  const cardsSection = (
    <ProgressCards
      month={month}
      year={year}
      editing={editing}
      onStartEditing={onStartEditing}
      onFinishEditing={onFinishEditing}
      adding={adding}
      onAddingChange={onAddingChange}
      onNavigate={onNavigate}
      scroller={leading.scroller}
      onDragChange={setDragging}
      exclude={daysBeside ? ['days'] : []}
      dayReveal={daysBeside ? undefined : dayReveal}
      dayRef={dayRef}
    />
  )

  const leadingScroll = (
    <View ref={leading.frameRef} collapsable={false} style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        ref={leadingRef}
        {...scrollBars}
        onScrollBeginDrag={(e) => {
          scrollBars?.onScrollBeginDrag(e)
          leadingAnchor.onScrollBeginDrag()
        }}
        onScrollEndDrag={() => {
          scrollBars?.onScrollEndDrag()
          leadingAnchor.onScrollEndDrag()
        }}
        onMomentumScrollEnd={() => {
          scrollBars?.onMomentumScrollEnd()
          leadingAnchor.onMomentumScrollEnd()
        }}
        onScrollToTop={() => {
          scrollBars?.onScrollToTop()
          anchor.reset()
        }}
        onScroll={(e) => {
          leading.props.onScroll(e)
          if (!daysBeside) dayReveal.onScroll(e)
          scrollBars?.onScroll(e)
        }}
        scrollEventThrottle={16}
        onLayout={(e) => {
          leading.props.onLayout()
          scrollBars?.onLayout(e)
        }}
        onContentSizeChange={(width, height) => {
          leading.props.onContentSizeChange(width, height)
          scrollBars?.onContentSizeChange(width, height)
        }}
        scrollEnabled={!dragging}
        keyboardShouldPersistTaps='handled'
        style={{ flex: 1 }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: daysBeside ? undefined : 720,
          alignSelf: 'center',
          ...foldColumn,

          paddingHorizontal: daysBeside ? PROGRESS_CARD_GAP / 2 : 15,
          paddingTop: 15,
          paddingBottom:
            paddingBottom + (daysBeside ? 0 : dayReveal.bottomInset),
          gap: 12,
        }}
      >
        {leadingAnchor.origin}
        <View ref={anchor.anchorRef('report', 'leading')}>{report}</View>
        <View ref={anchor.anchorRef('cards', 'leading')}>{cardsSection}</View>
        {leadingAnchor.room}
      </KeyboardAwareScrollView>
    </View>
  )

  return (
    <SwipeMonthNavigator
      onSwipeForward={onSwipeForward}
      onSwipeBack={onSwipeBack}
      enabled={!editing}
      style={{ flex: 1 }}
    >
      {}
      <FoldSplit
        style={{
          flex: 1,
          width: '100%',
          maxWidth: daysBeside ? contentMaxWidth : undefined,
          alignSelf: 'center',
        }}
        paddingHorizontal={daysBeside ? 24 : 0}
        gap={24}
        leadingFraction={0.44}
        leading={
          <View style={{ flex: 1 }}>
            {daysBeside ? header : null}
            {leadingScroll}
          </View>
        }
        trailingStyle={daysBeside ? { paddingTop: insets.top } : undefined}
        trailing={
          daysBeside ? (
            <View ref={trailingFrame} collapsable={false} style={{ flex: 1 }}>
              <KeyboardAwareScrollView
                ref={dayReveal.scrollRef}
                onScrollBeginDrag={trailingAnchor.onScrollBeginDrag}
                onScrollEndDrag={trailingAnchor.onScrollEndDrag}
                onMomentumScrollEnd={trailingAnchor.onMomentumScrollEnd}
                onScroll={dayReveal.onScroll}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps='handled'
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingTop: 15 - PROGRESS_CARD_GAP / 2,
                  paddingBottom: paddingBottom + dayReveal.bottomInset,
                }}
              >
                {trailingAnchor.origin}
                <ReorderableContainer
                  editing={editing}
                  onMove={() => {}}
                  onLiftToEdit={() => onStartEditing('card')}
                  onBackgroundPress={onFinishEditing}
                  style={{
                    padding: PROGRESS_CARD_GAP / 2,

                    paddingTop: PROGRESS_CARD_GAP / 2 + (editing ? 8 : 0),
                  }}
                >
                  <ReorderableItem
                    id='days'
                    movable={false}
                    liftOutsideEditing='zone'
                    onRemove={() => cards.remove('days')}
                    removeLabel={i18n.t('progressCards.removeA11y', {
                      card: PROGRESS_CARDS.days.title(),
                    })}
                    accessibilityLabel={PROGRESS_CARDS.days.title()}
                    accessibilityActions={[
                      {
                        name: 'remove',
                        label: i18n.t('progressCards.removeCard'),
                      },
                    ]}
                    onAccessibilityAction={(name) => {
                      if (name === 'remove') cards.remove('days')
                    }}
                  >
                    {}
                    <DaysCard
                      month={month}
                      year={year}
                      size='full'
                      dayReveal={dayReveal}
                      dayRef={dayRef}
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
                  </ReorderableItem>
                </ReorderableContainer>
                {trailingAnchor.room}
              </KeyboardAwareScrollView>
            </View>
          ) : undefined
        }
      />
    </SwipeMonthNavigator>
  )
}

export default ProgressMonthTab
