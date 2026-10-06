import { analytics } from '@/lib/analytics'

/**
 * Outcomes on Plan Details that no other event counts. Edit, Duplicate, and Log
 * as Time show up downstream (Plan and Time Entry events); inviting someone who
 * asked to join is `buddy_join_request_answered`.
 */
export type PlanDetailsAction = 'delete' | 'invite_buddy'

/** Counts a Plan Details outcome; no ids, names, dates, or content. */
export const trackPlanDetailsAction = (
  action: PlanDetailsAction,
  plan: { kind: 'day' | 'recurring'; linked: boolean }
) =>
  analytics.capture('plan_details_action', {
    action,
    plan_kind: plan.kind,
    linked: plan.linked,
  })
