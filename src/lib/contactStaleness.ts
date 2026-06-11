import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { MarkerColors } from '@/types/markerColors'
import { StalenessBreakpoints } from '@/types/staleness'
import { normalizeStalenessBreakpoints } from '@/constants/staleness'
import { getMostRecentConversationForContact } from '@/lib/contacts'

export type ContactStaleness = 'never' | 'recent' | 'week' | 'month'

/**
 * Display order shared by the color key and the Color Key settings screen: most
 * stale first so the eye lands on red (needs attention) before grey (no data).
 * Mirrors ContactsStatsHeader.
 */
export const STALENESS_DISPLAY_ORDER: ContactStaleness[] = [
  'month',
  'week',
  'recent',
  'never',
]

/** Which user-overridable marker color each staleness bucket reads from. */
export const stalenessToMarkerKey: Record<
  ContactStaleness,
  keyof MarkerColors
> = {
  never: 'noConversations',
  recent: 'withinThePastWeek',
  week: 'longerThanAWeekAgo',
  month: 'longerThanAMonthAgo',
}

/**
 * Classifies a contact by how long it has been since the most recent
 * conversation, against the user's `stalenessBreakpoints` preference:
 *
 * - `never`: no conversations have been recorded with this contact
 * - `recent`: most recent conversation is within `weekDays` days
 * - `week`: most recent conversation is older than `weekDays` but within
 *   `monthDays` days
 * - `month`: most recent conversation is older than `monthDays` days
 *
 * `breakpoints` is required (not defaulted) so every classification visibly
 * threads the preference through — a defaulted parameter would let a call site
 * silently keep classifying with stock thresholds after the user changes
 * theirs.
 */
export function getContactStaleness(
  contact: Contact,
  conversations: Visit[],
  breakpoints: StalenessBreakpoints
): ContactStaleness {
  const mostRecent = getMostRecentConversationForContact({
    conversations,
    contact,
  })
  if (!mostRecent) return 'never'

  const { weekDays, monthDays } = normalizeStalenessBreakpoints(breakpoints)
  const mostRecentDate = moment(mostRecent.date)
  const today = moment()

  if (mostRecentDate.isBefore(today.clone().subtract(monthDays, 'days'))) {
    return 'month'
  }
  if (mostRecentDate.isBefore(today.clone().subtract(weekDays, 'days'))) {
    return 'week'
  }
  return 'recent'
}

/**
 * Maps a staleness bucket to its themed marker color. Pass the result of
 * {@link useMarkerColors} so the color picks up user overrides.
 */
export function stalenessToColor(
  staleness: ContactStaleness,
  colors: MarkerColors
): string {
  switch (staleness) {
    case 'never':
      return colors.noConversations
    case 'recent':
      return colors.withinThePastWeek
    case 'week':
      return colors.longerThanAWeekAgo
    case 'month':
      return colors.longerThanAMonthAgo
  }
}
