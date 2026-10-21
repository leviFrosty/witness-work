import AllDaysList from '@/features/service-reports/components/AllDaysList'
import { renderDaySheetPlanForm } from '@/features/plans/components/PlanDayForm'
import { daySheetPlanDetails } from '@/features/plans/components/DaySheetPlanDetails'
import type { Ref } from 'react'
import type { View } from 'react-native'
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
  dayRef,
}: ProgressCardProps & {
  /** Keeps a picked day above its sheet in the full list. */
  dayReveal?: RevealAboveSheet
  /** Each day's row, by its date, e.g. to keep it in view. */
  dayRef?: (day: string) => Ref<View>
}) {
  return (
    <AllDaysList
      month={month}
      year={year}
      variant={size === 'compact' ? 'compact' : 'full'}
      inset={0}
      dayReveal={dayReveal}
      dayRef={dayRef}
      wrapHeader={wrapEditTrigger}
      renderPlanForm={renderDaySheetPlanForm}
      renderPlanDetails={daySheetPlanDetails}
    />
  )
}
