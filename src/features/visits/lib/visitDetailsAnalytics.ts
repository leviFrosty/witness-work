import { analytics } from '@/lib/analytics'

export type VisitDetailsAction = 'delete' | 'invite_buddy'

export const trackVisitDetailsAction = (
  action: VisitDetailsAction,
  visit: { notAtHome: boolean; hasFollowUp: boolean }
) =>
  analytics.capture('visit_details_action', {
    action,
    not_at_home: visit.notAtHome,
    has_follow_up: visit.hasFollowUp,
  })
