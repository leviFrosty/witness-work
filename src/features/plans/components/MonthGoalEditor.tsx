import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import usePublisher from '@/hooks/usePublisher'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import MonthGoalEditorSheet from '@/features/service-reports/components/MonthGoalEditorSheet'

/** The Monthly Goal editor for any month the Schedule shows. */
export default function MonthGoalEditor({
  target,
  open,
  onOpenChange,
}: {
  target: CalendarMonth
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { baseGoalHours, effectiveGoalHours, setOverride, clearOverride } =
    useMonthlyGoal(target)
  const { annualGoalHours, hasAnnualGoal } = usePublisher(target)
  return (
    <MonthGoalEditorSheet
      open={open}
      onOpenChange={onOpenChange}
      month={target.month}
      year={target.year}
      regularGoalHours={baseGoalHours}
      effectiveGoalHours={effectiveGoalHours}
      annualGoalHours={hasAnnualGoal ? annualGoalHours : null}
      onSaveGoal={setOverride}
      onUseRegularGoal={clearOverride}
    />
  )
}
