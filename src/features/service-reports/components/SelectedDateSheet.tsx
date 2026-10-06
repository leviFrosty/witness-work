import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { Sheet } from 'tamagui'
import useTheme from '@/contexts/theme'
import useSheetBottomInset from '@/hooks/useSheetBottomInset'
import { DayPlan, TimeEntry } from '@/types/timeEntry'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import DayHistoryView from '@/features/service-reports/components/DayHistoryView'

export type SelectedDateSheetState = {
  open: boolean
  date: Date
}

interface Props {
  sheet: SelectedDateSheetState
  setSheet: React.Dispatch<React.SetStateAction<SelectedDateSheetState>>
  thisMonthsReports: TimeEntry[] | null
  onAddTime?: () => void
  onPlanDay?: () => void
  onEditTimeReport?: (report: TimeEntry) => void
  /**
   * Extra content under the day's history (e.g. Buddies' plans). Its menus
   * navigate through `onNavigate`, which closes the sheet first.
   */
  renderFooter?: (
    date: Date,
    onNavigate: (navigate: () => void) => void
  ) => React.ReactNode
  /** Extra lines under a one-time Plan's row, e.g. who the Plan is with. */
  renderDayPlanFooter?: (plan: DayPlan) => React.ReactNode
}

const SelectedDateSheet: React.FC<Props> = ({
  sheet,
  setSheet,
  thisMonthsReports,
  onAddTime,
  onPlanDay,
  onEditTimeReport,
  renderFooter,
  renderDayPlanFooter,
}) => {
  const theme = useTheme()
  const sheetBottomInset = useSheetBottomInset()
  // Navigation chosen from a row or its context menu waits for the sheet to
  // close, or the pushed screen would land underneath the modal sheet.
  const pendingNavigation = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!sheet.open && pendingNavigation.current) {
      const navigate = pendingNavigation.current
      pendingNavigation.current = null
      setTimeout(navigate, 125)
    }
  }, [sheet.open])

  const navigateAfterClosing = (navigate: () => void) => {
    pendingNavigation.current = navigate
    setSheet({ ...sheet, open: false })
  }

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(o: boolean) => setSheet({ ...sheet, open: o })}
      dismissOnSnapToBottom
      modal
      snapPoints={[85]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame paddingBottom={sheetBottomInset}>
        <View
          style={{
            paddingHorizontal: 30,
            gap: 10,
            flex: 1,
            paddingTop: 30,
            paddingBottom: 30,
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          {/* Must flex — RN 0.86's Yoga no longer clamps an unflexed scroll
              view to its parent's bounds, so without this it sizes to its
              content instead of the sheet frame. */}
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ minHeight: 10 }}
          >
            <DayHistoryView
              key={`${sheet.open}-${sheet.date.getTime()}`}
              date={sheet.date}
              serviceReports={thisMonthsReports || []}
              showHeader={true}
              onTimeReportPress={(report) => {
                setSheet({ ...sheet, open: false })
                onEditTimeReport?.(report)
              }}
              onAddTime={() => {
                setSheet({ ...sheet, open: false })
                onAddTime?.()
              }}
              onPlanDay={() => {
                setSheet({ ...sheet, open: false })
                onPlanDay?.()
              }}
              onNavigate={navigateAfterClosing}
              renderDayPlanFooter={renderDayPlanFooter}
            />
            {renderFooter?.(sheet.date, navigateAfterClosing)}
          </KeyboardAwareScrollView>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default SelectedDateSheet
