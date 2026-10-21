import AllDaysList from '@/features/service-reports/components/AllDaysList'
import { renderDaySheetPlanForm } from '@/features/plans/components/PlanDayForm'
import { daySheetPlanDetails } from '@/features/plans/components/DaySheetPlanDetails'
import type { RevealAboveSheet } from '@/hooks/useRevealAboveSheet'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

/**
 * Every day of the month, most recent first: all of them (`full`), or a few in
 * a card that scrolls on its own (`compact`).
 */
export default function DaysCard({
  month,
  year,
  size,
  wrapEditTrigger,
  dayReveal,
}: ProgressCardProps & {
  /** Keeps a picked day above its sheet in the full list. */
  dayReveal?: RevealAboveSheet
}) {
  return (
    <AllDaysList
      month={month}
      year={year}
      variant={size === 'compact' ? 'compact' : 'full'}
      inset={0}
      dayReveal={dayReveal}
      wrapHeader={wrapEditTrigger}
      renderPlanForm={renderDaySheetPlanForm}
      renderPlanDetails={daySheetPlanDetails}
    />
  )
}
