import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import usePublisher from '@/hooks/usePublisher'
import MonthGoalEditorSheet from '@/features/service-reports/components/MonthGoalEditorSheet'
import MonthStatusSheet from '@/features/service-reports/components/MonthStatusSheet'
import useMonthStatus, {
  type MonthStatusSource,
} from '@/features/service-reports/hooks/useMonthStatus'
import type { MonthEditTarget } from '@/features/service-reports/lib/monthEditTargets'

const MonthStatusGoalSheets = ({
  month,
  year,
  editing,
  onClose,
  source,
}: {
  month: number
  year: number

  editing: MonthEditTarget | null
  onClose: () => void
  source: MonthStatusSource
}) => {
  const { baseGoalHours, effectiveGoalHours, setOverride, clearOverride } =
    useMonthlyGoal({ month, year })
  const { annualGoalHours, hasAnnualGoal } = usePublisher({ month, year })
  const monthStatus = useMonthStatus({ month, year })
  const onOpenChange = (open: boolean) => {
    if (!open) onClose()
  }

  return (
    <>
      {baseGoalHours > 0 ? (
        <MonthGoalEditorSheet
          open={editing === 'goal'}
          onOpenChange={onOpenChange}
          month={month}
          year={year}
          regularGoalHours={baseGoalHours}
          effectiveGoalHours={effectiveGoalHours}
          annualGoalHours={hasAnnualGoal ? annualGoalHours : null}
          onSaveGoal={setOverride}
          onUseRegularGoal={clearOverride}
        />
      ) : null}
      <MonthStatusSheet
        open={editing === 'status'}
        onOpenChange={onOpenChange}
        month={month}
        year={year}
        status={monthStatus.status}
        onSave={(status, scope) => monthStatus.save(status, scope, source)}
      />
    </>
  )
}

export default MonthStatusGoalSheets
