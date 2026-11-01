import { useNavigation } from '@react-navigation/native'
import { useMileageView } from '@/stores/mileageView'
import type { MileageSource, RootStackNavigation } from '@/types/rootStack'

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
