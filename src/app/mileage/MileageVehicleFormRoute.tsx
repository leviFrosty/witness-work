import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import MileageVehicleFormScreen from '@/features/mileage/screens/MileageVehicleFormScreen'
import CarPeopleSection from '@/app/sharedCars/CarPeopleSection'

/**
 * The car form with Shared Cars' People section plugged in. Mileage can't
 * import Shared Cars or Buddies (feature boundary), so the app tier supplies
 * the section.
 */
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
