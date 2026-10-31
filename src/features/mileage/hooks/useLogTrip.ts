import { useNavigation } from '@react-navigation/native'
import { useMileageView } from '@/stores/mileageView'
import type { MileageSource, RootStackNavigation } from '@/types/rootStack'

/** Opens the trip form, or the car form first when there's no active car. */
export default function useLogTrip(source: MileageSource) {
  const navigation = useNavigation<RootStackNavigation>()
  const hasActiveCar = useMileageView((view) =>
    view.vehicles.some((v) => !v.archived)
  )
  return () =>
    hasActiveCar
      ? navigation.navigate('MileageTripForm', { source })
      : navigation.navigate('MileageVehicleForm', {
          source,
          thenLogTrip: true,
        })
}
