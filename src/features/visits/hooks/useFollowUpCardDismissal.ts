import { usePreferences } from '@/stores/preferences'
import type { Visit } from '@/types/visit'
import {
  followUpCardKey,
  isFollowUpCardDismissed,
  type FollowUpCard,
} from '@/features/visits/lib/followUpCards'

/**
 * Remembers closing a Home Follow-up card until a new or rescheduled Follow-up
 * shows up on it.
 */
export default function useFollowUpCardDismissal(
  card: FollowUpCard,
  visits: Visit[]
) {
  const dismissedFollowUpCards = usePreferences((s) => s.dismissedFollowUpCards)
  const set = usePreferences((s) => s.set)

  const dismissed = isFollowUpCardDismissed(
    visits,
    dismissedFollowUpCards?.[card]
  )

  const dismiss = () => {
    set({
      dismissedFollowUpCards: {
        ...dismissedFollowUpCards,
        [card]: visits.map(followUpCardKey),
      },
    })
  }

  return { dismissed, dismiss }
}
