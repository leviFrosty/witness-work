import { type RouteProp, useRoute } from '@react-navigation/native'
import BadgeViewScreen from '@/features/badges/screens/BadgeViewScreen'
import BadgeReactionBar from '@/features/buddies/components/BadgeReactionBar'
import BadgeReactionsReceived from '@/features/buddies/components/BadgeReactionsReceived'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { holdsBadge } from '@/features/buddies/lib/sharedBadges'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { parseBadgeKey } from '@/lib/badges/catalog'
import { knownSharedBadges } from '@/lib/badges/display'
import { usePreferences } from '@/stores/preferences'
import type { SharedBadge } from '@/types/badges'
import type { RootStackParamList } from '@/types/rootStack'

/**
 * Hands the badge view what lives in Buddies: whose badge it is, and its
 * reactions (received on the User's own badge, a reaction bar on a buddy's).
 * Reactions show only where Buddies does and with badges shown.
 */
export default function BadgeViewRouteScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'BadgeView'>>()
  const buddiesEnabled = useBuddiesEnabled()
  const showBadges = usePreferences((s) => s.showBadges)
  const earned = usePreferences((s) => !!s.earnedBadges[params.badgeKey])
  const inboxId = params.owner === 'me' ? null : params.owner.inboxId
  const buddy = useBuddies((s) =>
    inboxId
      ? s.buddies.find(
          (candidate) =>
            candidate.inboxId === inboxId && candidate.status === 'active'
        )
      : undefined
  )
  const reactions = buddiesEnabled && showBadges

  if (!inboxId) {
    return (
      <BadgeViewScreen
        footer={
          reactions && earned ? (
            <BadgeReactionsReceived badgeKey={params.badgeKey} />
          ) : null
        }
      />
    )
  }

  const name = buddy ? buddyDisplayName(buddy) : null
  // Bell news can name a level they've grown past since; it's still theirs.
  const parsed = parseBadgeKey(params.badgeKey)
  const shown: SharedBadge | null = parsed
    ? parsed.level
      ? { c: parsed.art, l: parsed.level }
      : { c: parsed.art }
    : null
  const badge =
    shown && holdsBadge(knownSharedBadges(buddy?.badges), shown)
      ? shown
      : undefined
  return (
    <BadgeViewScreen
      buddy={
        buddy && name
          ? {
              name,
              avatar: (
                <BuddyAvatar
                  avatar={buddy.avatar}
                  name={name}
                  color={buddy}
                  size={24}
                />
              ),
            }
          : null
      }
      footer={
        reactions && buddy && name && badge ? (
          <BadgeReactionBar inboxId={buddy.inboxId} badge={badge} name={name} />
        ) : null
      }
    />
  )
}
