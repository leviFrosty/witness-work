import { useEffect } from 'react'
import type { PlanDetailsSlot } from '@/features/service-reports/components/DayHistoryView'
import {
  OwnPlanDetailsActions,
  OwnPlanDetailsBody,
} from '@/features/plans/components/OwnPlanDetails'
import usePlanDetails from '@/features/plans/hooks/usePlanDetails'

/** Edit and More for the Plan a day's sheet shows, in the sheet's header. */
const DaySheetPlanDetailsActions = ({ slot }: { slot: PlanDetailsSlot }) => {
  const { item } = usePlanDetails(slot.plan)
  if (!item) return null
  return (
    <OwnPlanDetailsActions
      item={item}
      onEdit={slot.onEdit}
      onNavigate={slot.onNavigate}
    />
  )
}

/**
 * Plan Details in a day's sheet, in place of the day. The day comes back once
 * the Plan is gone, including a buddy's Plan after "Can't make it".
 */
const DaySheetPlanDetailsBody = ({ slot }: { slot: PlanDetailsSlot }) => {
  const { now, item, invitation, answering } = usePlanDetails(slot.plan)
  const { onGone } = slot

  useEffect(() => {
    if (!item) onGone()
  }, [item, onGone])

  if (!item) return null
  return (
    <OwnPlanDetailsBody
      item={item}
      share={invitation}
      now={now}
      answering={answering}
      onOpenPlan={slot.onOpenPlan}
    />
  )
}

/** Plan Details as a day's sheet shows it: header actions and body. */
export const daySheetPlanDetails = {
  actions: (slot: PlanDetailsSlot) => (
    <DaySheetPlanDetailsActions slot={slot} />
  ),
  body: (slot: PlanDetailsSlot) => <DaySheetPlanDetailsBody slot={slot} />,
}
