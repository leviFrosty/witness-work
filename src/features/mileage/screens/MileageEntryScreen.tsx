import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import MileageEntryEditor from '@/features/mileage/components/MileageEntryEditor'

export default function MileageEntryScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'MileageEntry'>) {
  return (
    <MileageEntryEditor
      {...route.params}
      onDone={() => navigation.goBack()}
      onCreateVehicle={() => navigation.navigate('MileageVehicle')}
    />
  )
}
