import { useEffect } from 'react'
import type { PlanDetailsSlot } from '@/features/service-reports/components/DayHistoryView'
import {
  OwnPlanDetailsActions,
  OwnPlanDetailsBody,
} from '@/features/plans/components/OwnPlanDetails'
import usePlanDetails from '@/features/plans/hooks/usePlanDetails'

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

export const daySheetPlanDetails = {
  actions: (slot: PlanDetailsSlot) => (
    <DaySheetPlanDetailsActions slot={slot} />
  ),
  body: (slot: PlanDetailsSlot) => <DaySheetPlanDetailsBody slot={slot} />,
}
