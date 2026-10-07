import BadgesScreen from '@/features/badges/screens/BadgesScreen'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'

/** Tells the Badges screen whether Buddies is available, across feature tiers. */
export default function BadgesRouteScreen() {
  return <BadgesScreen buddiesAvailable={useBuddiesEnabled()} />
}
