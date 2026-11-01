import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import { hidePetVisits } from '@/app/pet/hidePetVisits'
import usePetVisits from '@/app/pet/usePetVisits'
import PetVisitsScreen from '@/features/pet/screens/PetVisitsScreen'

export default function PetVisitsRoute(
  props: NativeStackScreenProps<RootStackParamList, 'PetVisits'>
) {
  const visits = usePetVisits()
  return (
    <PetVisitsScreen {...props} visits={visits} onHideVisit={hidePetVisits} />
  )
}
