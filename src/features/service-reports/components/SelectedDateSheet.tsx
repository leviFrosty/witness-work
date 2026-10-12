import { useRef } from 'react'
import Sheet from '@/components/ui/Sheet'
import useTheme from '@/contexts/theme'
import { DayPlan, TimeEntry } from '@/types/timeEntry'
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
  // Navigation chosen from a row or its context menu waits for the sheet to
  // close, or the pushed screen would land underneath the sheet.
  const pendingNavigation = useRef<(() => void) | null>(null)

  const navigateAfterClosing = (navigate: () => void) => {
    pendingNavigation.current = navigate
    setSheet({ ...sheet, open: false })
  }

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(o) => setSheet({ ...sheet, open: o })}
      onClosed={() => {
        const navigate = pendingNavigation.current
        pendingNavigation.current = null
        navigate?.()
      }}
      backgroundColor={theme.colors.backgroundLighter}
    >
      <Sheet.ScrollView contentContainerStyle={{ padding: 30, minHeight: 10 }}>
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
      </Sheet.ScrollView>
    </Sheet>
  )
}

export default SelectedDateSheet
