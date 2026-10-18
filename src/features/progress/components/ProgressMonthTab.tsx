import { useMemo, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import useServiceReport from '@/stores/serviceReport'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useRevealAboveSheet from '@/hooks/useRevealAboveSheet'
import { getMonthsReports } from '@/lib/serviceReport'

import MonthReport from '@/features/service-reports/components/MonthReport'
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

interface ProgressMonthTabProps {
  month: number
  year: number
  onSwipeForward: () => void
  onSwipeBack: () => void
  /** The cards are being edited (Edit in the header, or a long press). */
  editing: boolean
  onStartEditing: (source: 'card' | 'add' | 'footer') => void
  onFinishEditing: () => void
  /** The Add Cards sheet is open. */
  adding: boolean
  onAddingChange: (adding: boolean) => void
  onNavigate: (destination: ProgressCardDestination) => void
}

/**
 * Month tab for `ProgressScreen`: the month's report, always first, then the
 * User's Progress cards (see `ProgressCards`). In a wide window the Days list,
 * when it's one of them, sits in its own column beside the rest.
 */
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
}: ProgressMonthTabProps) => {
  const insets = useSafeAreaInsets()
  const { isWide, hasSidebar, contentMaxWidth } = useAdaptiveLayout()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const cards = useProgressCards(month, year)
  // The day picked from the Days list stays in view above that day's sheet.
  const dayReveal = useRevealAboveSheet()
  const [dragging, setDragging] = useState(false)

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  const days = cards.shown.find((item) => item.id === 'days')
  const daysBeside = isWide && days !== undefined
  // With Days in the same column, revealing a picked day scrolls that column.
  const ownScrollRef = useRef<KeyboardAwareScrollView>(null)
  const leadingRef = daysBeside ? ownScrollRef : dayReveal.scrollRef
  const leading = useReorderScroller(leadingRef, {
    obscuredBottom: hasSidebar ? 0 : insets.bottom + TAB_BAR_HEIGHT,
  })
  const paddingBottom = insets.bottom + (hasSidebar ? 30 : 100)

  // The report can't be removed or moved, so it rests while the cards are
  // edited; tapping it, like any empty space, ends editing.
  const report = (
    <Pressable
      disabled={!editing}
      onPress={onFinishEditing}
      accessible={false}
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
    />
  )

  const leadingScroll = (
    <View ref={leading.frameRef} collapsable={false} style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        ref={leadingRef}
        onScroll={(e) => {
          leading.props.onScroll(e)
          if (!daysBeside) dayReveal.onScroll(e)
        }}
        scrollEventThrottle={16}
        onLayout={leading.props.onLayout}
        onContentSizeChange={leading.props.onContentSizeChange}
        scrollEnabled={!dragging}
        keyboardShouldPersistTaps='handled'
        style={{ flex: 1 }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: daysBeside ? undefined : 720,
          alignSelf: 'center',
          // Beside Days, just room for the edit buttons past the cards' edges.
          paddingHorizontal: daysBeside ? PROGRESS_CARD_GAP / 2 : 15,
          paddingTop: 15,
          paddingBottom:
            paddingBottom + (daysBeside ? 0 : dayReveal.bottomInset),
          gap: 12,
        }}
      >
        {report}
        {cardsSection}
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
      {/* One tree either way, so adding or removing Days beside the cards
          doesn't remount them (and close the Add Cards sheet). */}
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: daysBeside ? contentMaxWidth : undefined,
          alignSelf: 'center',
          paddingHorizontal: daysBeside ? 24 : 0,
          flexDirection: 'row',
          gap: 24,
        }}
      >
        <View style={{ flex: daysBeside ? 0.44 : 1, minWidth: 0 }}>
          {leadingScroll}
        </View>
        {daysBeside ? (
          <KeyboardAwareScrollView
            ref={dayReveal.scrollRef}
            onScroll={dayReveal.onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps='handled'
            style={{ flex: 0.56, minWidth: 0 }}
            contentContainerStyle={{
              // The grid's cells pad each card by half a gap, which is where
              // the edit buttons sit; the list gets the same room.
              paddingTop: 15 - PROGRESS_CARD_GAP / 2,
              paddingBottom: paddingBottom + dayReveal.bottomInset,
            }}
          >
            <ReorderableContainer
              editing={editing}
              // Beside the cards there's nothing to move it among.
              onMove={() => {}}
              onLiftToEdit={() => onStartEditing('card')}
              onBackgroundPress={onFinishEditing}
              style={{
                padding: PROGRESS_CARD_GAP / 2,
                // The list's header starts at its edge; keep it clear of the
                // remove badge.
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
                  { name: 'remove', label: i18n.t('progressCards.removeCard') },
                ]}
                onAccessibilityAction={(name) => {
                  if (name === 'remove') cards.remove('days')
                }}
              >
                {/* Beside the cards the list always shows every day. */}
                <DaysCard
                  month={month}
                  year={year}
                  size='full'
                  dayReveal={dayReveal}
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
          </KeyboardAwareScrollView>
        ) : null}
      </View>
    </SwipeMonthNavigator>
  )
}

export default ProgressMonthTab
