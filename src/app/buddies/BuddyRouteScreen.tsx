import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import BuddyPetRoomSection from '@/app/buddies/BuddyPetRoomSection'
import BuddyDetailScreen from '@/features/buddies/screens/BuddyDetailScreen'

export default function BuddyRouteScreen(
  props: NativeStackScreenProps<RootStackParamList, 'Buddy'>
) {
  return (
    <BuddyDetailScreen
      {...props}
      renderPetRoom={(buddy) => <BuddyPetRoomSection buddy={buddy} />}
    />
  )
}
