import moment from 'moment'
import { View } from 'react-native'
import Sheet from '@/components/ui/Sheet'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useSheetBottomInset from '@/hooks/useSheetBottomInset'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import CalendarKey from '@/features/plans/components/CalendarKey'
import ScheduleInsights from '@/features/plans/components/ScheduleInsights'
import ScheduleScreenSections from '@/features/plans/components/ScheduleScreenSections'

/**
 * Everything about one month that the calendar doesn't show on its face: pace
 * and goal coverage (each opening its details), the Assistant, and the
 * calendar's color key. Opened from the focused month's goal meter.
 */
export default function MonthOverviewSheet({
  month,
  open,
  onOpenChange,
  onEditGoal,
}: {
  month: CalendarMonth
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Closes this sheet first, so the goal editor isn't stacked on it. */
  onEditGoal?: () => void
}) {
  const theme = useTheme()
  const bottomInset = useSheetBottomInset()

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      dismissOnSnapToBottom
      modal
      snapPoints={[80]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame
        paddingBottom={bottomInset}
        backgroundColor={theme.colors.backgroundLighter}
      >
        <Sheet.ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 24 }}
        >
          <View style={{ gap: 16 }}>
            <Text
              accessibilityRole='header'
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {moment({ year: month.year, month: month.month, day: 1 }).format(
                'MMMM YYYY'
              )}
            </Text>
            <ScheduleInsights
              month={month.month}
              year={month.year}
              onEditGoal={
                onEditGoal
                  ? () => {
                      onOpenChange(false)
                      setTimeout(onEditGoal, 250)
                    }
                  : undefined
              }
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
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}
