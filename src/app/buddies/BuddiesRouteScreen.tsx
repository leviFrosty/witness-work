import ProfileCard from '@/features/profile/components/ProfileCard'
import BuddiesScreen from '@/features/buddies/screens/BuddiesScreen'
import useBuddiesOnTheirWay from '@/app/buddies/useBuddiesOnTheirWay'

export default function BuddiesRouteScreen({
  asTab = false,
}: {
  asTab?: boolean
}) {
  const onTheirWay = useBuddiesOnTheirWay()
  return (
    <BuddiesScreen
      asTab={asTab}
      onTheirWay={onTheirWay}
      profileEditor={(nameInvalid) => <ProfileCard nameInvalid={nameInvalid} />}
    />
  )
}
