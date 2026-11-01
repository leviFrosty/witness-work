import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { MarkerColors } from '@/types/markerColors'
import { StalenessBreakpoints } from '@/types/staleness'
import { normalizeStalenessBreakpoints } from '@/constants/staleness'
import { getMostRecentConversationForContact } from '@/lib/contacts'

export type ContactStaleness = 'never' | 'recent' | 'week' | 'month'

export const STALENESS_DISPLAY_ORDER: ContactStaleness[] = [
  'month',
  'week',
  'recent',
  'never',
]

export function getEffectiveStalenessChipOrder(
  stored: readonly string[] | undefined
): ContactStaleness[] {
  return [...new Set([...(stored ?? []), ...STALENESS_DISPLAY_ORDER])].filter(
    (bucket): bucket is ContactStaleness =>
      STALENESS_DISPLAY_ORDER.includes(bucket as ContactStaleness)
  )
}

export const stalenessToMarkerKey: Record<
  ContactStaleness,
  keyof MarkerColors
> = {
  never: 'noConversations',
  recent: 'withinThePastWeek',
  week: 'longerThanAWeekAgo',
  month: 'longerThanAMonthAgo',
}

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
