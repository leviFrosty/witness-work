import type { ReactNode, RefObject } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AnchoredPopover, {
  type ResolveAnchorPosition,
} from '@/components/ui/AnchoredPopover'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import CalendarKey from '@/features/plans/components/CalendarKey'
import ScheduleInsights from '@/features/plans/components/ScheduleInsights'
import ScheduleScreenSections from '@/features/plans/components/ScheduleScreenSections'
import { formatDisplay } from '@/lib/dates'

const MARGIN = 12

export default function MonthOverviewPopover({
  month,
  onEditGoal,
  renderTrigger,
}: {
  month: CalendarMonth

  onEditGoal?: () => void
  renderTrigger: (props: {
    onPress: () => void
    expanded: boolean
    anchorRef: RefObject<View | null>
  }) => ReactNode
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const resolvePosition: ResolveAnchorPosition = ({
    anchor,
    windowWidth,
    windowHeight,
    contentWidth,
  }) => {
    const top = anchor.y + anchor.height + 8
    return {
      top,
      left: Math.min(
        Math.max(MARGIN, anchor.x),
        windowWidth - contentWidth - MARGIN
      ),
      maxHeight: windowHeight - top - Math.max(insets.bottom, MARGIN),
    }
  }

  return (
    <AnchoredPopover
      presentation='portal'
      contentWidth={Math.min(width - MARGIN * 2, 440)}
      resolvePosition={resolvePosition}
      contentStyle={{
        gap: 16,
        padding: 16,
        backgroundColor: theme.colors.backgroundLighter,
      }}
      renderTrigger={renderTrigger}
    >
      {({ closeThen }) => (
        <>
          <Text
            accessibilityRole='header'
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.bold,
            }}
          >
            {formatDisplay(
              { year: month.year, month: month.month, day: 1 },
              'MMMM YYYY'
            )}
          </Text>
          <ScheduleInsights
            month={month.month}
            year={month.year}
            onEditGoal={onEditGoal ? () => closeThen(onEditGoal) : undefined}
          />
          <ScheduleScreenSections month={month.month} year={month.year} />
          <View
            style={{
              padding: 12,
              borderRadius: theme.numbers.borderRadiusMd,
              backgroundColor: theme.colors.card,
            }}
          >
            <CalendarKey />
          </View>
        </>
      )}
    </AnchoredPopover>
  )
}
