import { analytics } from '@/lib/analytics'

export type PlanDetailsAction = 'delete' | 'invite_buddy'

export const trackPlanDetailsAction = (
  action: PlanDetailsAction,
  plan: { kind: 'day' | 'recurring'; linked: boolean }
) =>
  analytics.capture('plan_details_action', {
    action,
    plan_kind: plan.kind,
    linked: plan.linked,
  })
