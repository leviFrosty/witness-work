import ProfileCard from '@/features/profile/components/ProfileCard'
import BuddiesScreen from '@/features/buddies/screens/BuddiesScreen'

/** Composes the Profile editor into Buddies onboarding across feature tiers. */
export default function BuddiesTabScreen() {
  return <BuddiesScreen profileEditor={<ProfileCard editable />} />
}
