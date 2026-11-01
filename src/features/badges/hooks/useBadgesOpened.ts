import { useEffect } from 'react'
import { analytics } from '@/lib/analytics'
import { earnedBadgeCount } from '@/lib/badges/display'
import { usePreferences } from '@/stores/preferences'
import type { BadgesSource } from '@/types/rootStack'

export default function useBadgesOpened(source: BadgesSource) {
  useEffect(() => {
    analytics.capture('badges_opened', {
      source,
      earned_count: earnedBadgeCount(usePreferences.getState().earnedBadges),
    })
  }, [source])
}
