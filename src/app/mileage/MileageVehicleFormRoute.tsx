import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import MileageVehicleFormScreen from '@/features/mileage/screens/MileageVehicleFormScreen'
import CarPeopleSection from '@/app/sharedCars/CarPeopleSection'

export default function MileageVehicleFormRoute(
  props: NativeStackScreenProps<RootStackParamList, 'MileageVehicleForm'>
) {
  return (
    <MileageVehicleFormScreen
      {...props}
      renderPeople={({ vehicleId }) => (
        <CarPeopleSection vehicleId={vehicleId} />
      )}
    />
  )
}
