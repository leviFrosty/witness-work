import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScrollView } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import useTheme from '@/contexts/theme'
import VehicleManager from '@/features/mileage/components/VehicleManager'

export default function MileageVehiclesScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'MileageVehicles'>) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 15, paddingBottom: insets.bottom + 30 }}
    >
      <VehicleManager
        onAdd={() => navigation.navigate('MileageVehicle')}
        onEdit={(vehicleId) =>
          navigation.navigate('MileageVehicle', { vehicleId })
        }
      />
    </ScrollView>
  )
}
