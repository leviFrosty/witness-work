import BadgesScreen from '@/features/badges/screens/BadgesScreen'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'

export default function BadgesRouteScreen() {
  return <BadgesScreen buddiesAvailable={useBuddiesEnabled()} />
}
