import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import usePetVisits from '@/app/pet/usePetVisits'
import PetRoomScreen from '@/features/pet/screens/PetRoomScreen'

/** The pet's details, with today's visiting buddy pets from Buddies. */
export default function PetRoomRoute(
  props: NativeStackScreenProps<RootStackParamList, 'PetRoom'>
) {
  const visits = usePetVisits()
  return <PetRoomScreen {...props} visits={visits} />
}
