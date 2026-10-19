import ProfileCard from '@/features/profile/components/ProfileCard'
import BuddiesScreen from '@/features/buddies/screens/BuddiesScreen'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** Composes the Profile editor into Buddies onboarding across feature tiers. */
export default function BuddiesRouteScreen() {
  // How buddies see you: the account's card name, once a device set one.
  const cardName = useBuddies((state) => state.cardName?.name)
  return (
    <BuddiesScreen
      profileEditor={(nameInvalid) => (
        <ProfileCard
          nameInvalid={nameInvalid}
          shownName={cardName || undefined}
        />
      )}
    />
  )
}
