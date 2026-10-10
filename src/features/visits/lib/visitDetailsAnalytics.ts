import { analytics } from '@/lib/analytics'

/**
 * Outcomes on Visit Details that no other event counts. Edit, Log Visit,
 * Reschedule, and Dismiss show up downstream (`visit_created`,
 * `follow_up_rescheduled`, `follow_up_dismissed`).
 */
export type VisitDetailsAction = 'delete' | 'invite_buddy'

/** Counts a Visit Details outcome; no ids, names, dates, or content. */
export const trackVisitDetailsAction = (
  action: VisitDetailsAction,
  visit: { notAtHome: boolean; hasFollowUp: boolean }
) =>
  analytics.capture('visit_details_action', {
    action,
    not_at_home: visit.notAtHome,
    has_follow_up: visit.hasFollowUp,
  })
