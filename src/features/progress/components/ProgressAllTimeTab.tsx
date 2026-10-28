import { useRef, useState } from 'react'
import { View } from 'react-native'
import { Clock as ClockIcon } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AdaptiveSplitScrollView from '@/components/ui/layout/AdaptiveSplitScrollView'
import type { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import useReorderScroller from '@/components/ui/reorderable/useReorderScroller'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import type { HideBarsScrollProps } from '@/hooks/useHideBarsOnScroll'
import useTabReselect from '@/hooks/useTabReselect'

import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { getLifetimeHours } from '@/lib/serviceReport'
import i18n from '@/lib/locales'

import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import LifetimeHoursCard from '@/features/progress/components/LifetimeHoursCard'
import YearByYearList from '@/features/progress/components/YearByYearList'
import AllTimeProgressCards from '@/features/progress/components/cards/allTime/AllTimeProgressCards'
import RestWhileEditing from '@/features/progress/components/cards/RestWhileEditing'
import type { ProgressCardEditStart } from '@/features/progress/components/cards/ProgressCardGrid'
import type { ProgressCardDestination } from '@/features/progress/components/cards/progressCardRegistry'
import { useAllTimeEntries } from '@/features/progress/hooks/usePeriodCardData'

/**
 * Progress screen's "All-time" tab. Aggregates every service report the user
 * has ever logged into:
 *
 * - A hero `LifetimeHoursCard` (raw unadjusted lifetime hours + span metadata).
 * - The User's All Time cards (see `AllTimeProgressCards`).
 * - A `YearByYearList` of every service year in the continuous span from the
 *   earliest report to the current service year.
 *
 * Renders a centered `Empty` state instead when no reports exist.
 */
interface ProgressAllTimeTabProps {
  /** Invoked when the user taps a year row — parent switches to Year tab. */
  onYearPress: (endYear: number) => void
  /** Tucks the screen's header and tab bar away; see `useHideBarsOnScroll`. */
  scrollBars?: HideBarsScrollProps
  /** The cards are being edited (Edit in the header, or a long press). */
  editing: boolean
  onStartEditing: (source: ProgressCardEditStart) => void
  onFinishEditing: () => void
  /** The Add Cards sheet is open. */
  adding: boolean
  onAddingChange: (adding: boolean) => void
  onNavigate: (destination: ProgressCardDestination) => void
}

/**
 * Whether All Time has nothing to show yet. Keys off reports existing at all —
 * not `getLifetimeHours` alone — so users with only zero-hour entries (e.g.
 * placeholder reports) still see the aggregated view instead of the empty
 * state. Spec also allows hiding when lifetime hours is exactly 0; falling back
 * to length keeps behavior defensive for both cases.
 */
const useAllTimeIsEmpty = () => {
  const entries = useAllTimeEntries()
  return entries.length === 0 || getLifetimeHours(entries) === 0
}

const ProgressAllTimeTab = ({
  onYearPress,
  scrollBars,
  editing,
  onStartEditing,
  onFinishEditing,
  adding,
  onAddingChange,
  onNavigate,
}: ProgressAllTimeTabProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { isWide, hasBottomBar } = useAdaptiveLayout()
  const isEmpty = useAllTimeIsEmpty()
  const scrollRef = useRef<KeyboardAwareScrollView>(null)
  const scroller = useReorderScroller(scrollRef, {
    obscuredBottom: hasBottomBar ? insets.bottom + TAB_BAR_HEIGHT : 0,
  })
  const [dragging, setDragging] = useState(false)
  // Tapping Progress again heads back to the top.
  useTabReselect(() => scrollRef.current?.scrollToPosition(0, 0, true))

  if (isEmpty) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: insets.bottom,
        }}
      >
        <Empty
          icon={
            <LucideIcon icon={ClockIcon} size={24} color={theme.colors.text} />
          }
          title={i18n.t('emptyAllTime_title')}
          description={i18n.t('emptyAllTime_description')}
        />
      </View>
    )
  }

  return (
    <AdaptiveSplitScrollView
      scrollBars={scrollBars}
      leadingFraction={0.42}
      paddingBottom={insets.bottom + (hasBottomBar ? 100 : 30)}
      compactPaddingHorizontal={0}
      leadingReorder={{ scrollRef, scroller, scrollEnabled: !dragging }}
      leading={
        <View style={{ paddingHorizontal: isWide ? 0 : 15, gap: 24 }}>
          <RestWhileEditing editing={editing} onFinishEditing={onFinishEditing}>
            <LifetimeHoursCard />
          </RestWhileEditing>
          <AllTimeProgressCards
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
        <RestWhileEditing editing={editing} onFinishEditing={onFinishEditing}>
          <YearByYearList onYearPress={onYearPress} />
        </RestWhileEditing>
      }
    />
  )
}

export default ProgressAllTimeTab
