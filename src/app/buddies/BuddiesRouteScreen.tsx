import ProfileCard from '@/features/profile/components/ProfileCard'
import BuddiesScreen from '@/features/buddies/screens/BuddiesScreen'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** Composes the Profile editor into Buddies onboarding across feature tiers. */
export default function BuddiesRouteScreen({
  asTab = false,
}: {
  /** The iPad sidebar's tab rather than a pushed page. */
  asTab?: boolean
}) {
  // How buddies see you: the account's card name, once a device set one.
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
