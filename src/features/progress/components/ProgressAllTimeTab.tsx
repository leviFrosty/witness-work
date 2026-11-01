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

interface ProgressAllTimeTabProps {
  onYearPress: (endYear: number) => void

  scrollBars?: HideBarsScrollProps

  editing: boolean
  onStartEditing: (source: ProgressCardEditStart) => void
  onFinishEditing: () => void

  adding: boolean
  onAddingChange: (adding: boolean) => void
  onNavigate: (destination: ProgressCardDestination) => void
}

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
