import { useEffect } from 'react'
import { analytics } from '@/lib/analytics'
import { earnedBadgeCount } from '@/lib/badges/display'
import { usePreferences } from '@/stores/preferences'
import type { BadgesSource } from '@/types/rootStack'

/**
 * Records one `badges_opened` per visit to the Badges screen: where it was
 * opened from and how many badges the User has earned.
 */
export default function useBadgesOpened(source: BadgesSource) {
  useEffect(() => {
    analytics.capture('badges_opened', {
      source,
      earned_count: earnedBadgeCount(usePreferences.getState().earnedBadges),
    })
  }, [source])
}
