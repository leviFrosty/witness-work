import ProfileCard from '@/features/profile/components/ProfileCard'
import BuddiesScreen from '@/features/buddies/screens/BuddiesScreen'

export default function BuddiesRouteScreen({
  asTab = false,
}: {
  asTab?: boolean
}) {
  return (
    <BuddiesScreen
      asTab={asTab}
      profileEditor={(nameInvalid) => <ProfileCard nameInvalid={nameInvalid} />}
    />
  )
}
