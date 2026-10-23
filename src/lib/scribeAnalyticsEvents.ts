/**
 * Scribe AI events; spread into analyticsEventNames. Properties:
 * docs/analytics.md → Scribe AI.
 */
export const scribeAnalyticsEventNames = [
  'scribe_entry_tapped',
  'scribe_turn_started',
  'scribe_turn_finished',
  'scribe_proposal_resolved',
  'scribe_undo',
  'scribe_limit_reached',
  'scribe_context_full',
  'scribe_capture_finished',
  'scribe_usage_viewed',
  'scribe_upsell_tapped',
  'scribe_supporter_rechecked',
  'quick_actions_tile_tapped',
] as const
