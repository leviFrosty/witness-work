import ProfileCard from '@/features/profile/components/ProfileCard'
import BuddiesScreen from '@/features/buddies/screens/BuddiesScreen'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddiesRouteScreen({
  asTab = false,
}: {
  asTab?: boolean
}) {
  const cardName = useBuddies((state) => state.cardName?.name)
  return (
    <BuddiesScreen
      asTab={asTab}
      profileEditor={(nameInvalid) => (
        <ProfileCard
          nameInvalid={nameInvalid}
          shownName={cardName || undefined}
        />
      )}
    />
  )
}
