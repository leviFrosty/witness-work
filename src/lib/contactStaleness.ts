import moment from 'moment'
import { Contact } from '@/types/contact'
import { Conversation } from '@/types/conversation'
import { MarkerColors } from '@/types/markerColors'
import { getMostRecentConversationForContact } from '@/lib/contacts'

export type ContactStaleness = 'never' | 'recent' | 'week' | 'month'

/**
 * Classifies a contact by how long it has been since the most recent
 * conversation.
 *
 * - `never`: no conversations have been recorded with this contact
 * - `recent`: most recent conversation is within the past week
 * - `week`: most recent conversation is older than a week but within a month
 * - `month`: most recent conversation is older than a month
 */
export function getContactStaleness(
  contact: Contact,
  conversations: Conversation[]
): ContactStaleness {
  const mostRecent = getMostRecentConversationForContact({
    conversations,
    contact,
  })
  if (!mostRecent) return 'never'

  const mostRecentDate = moment(mostRecent.date)
  const today = moment()

  if (mostRecentDate.isBefore(today.clone().subtract(1, 'month'))) {
    return 'month'
  }
  if (mostRecentDate.isBefore(today.clone().subtract(1, 'week'))) {
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
