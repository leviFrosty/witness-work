import moment from 'moment'
import useTheme from '@/contexts/theme'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * `YYYY-MM-DD` → one color per buddy planning to go out that day, for the
 * buddies the User chose to show. Past days are dropped even when a buddy's
 * card is stale.
 */
export default function useBuddyCalendarMarkers(): Record<string, string[]> {
  const theme = useTheme()
  const enabled = useBuddiesEnabled()
  const buddies = useBuddies((state) => state.buddies)
  const cards = useBuddies((state) => state.cards)
  if (!enabled) return {}

  const today = moment().format('YYYY-MM-DD')
  const markers: Record<string, string[]> = {}
  for (const buddy of buddies) {
    if (buddy.status !== 'active' || !buddy.showOnCalendar) continue
    for (const day of cards[buddy.inboxId]?.days ?? []) {
      if (day.d < today) continue
      markers[day.d] = [
        ...(markers[day.d] ?? []),
        buddyColor(theme, buddy.colorIndex),
      ]
    }
  }
  return markers
}
