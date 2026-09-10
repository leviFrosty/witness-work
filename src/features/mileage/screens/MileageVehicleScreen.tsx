import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import useTheme from '@/contexts/theme'
import VehicleEditor from '@/features/mileage/components/VehicleEditor'

export default function MileageVehicleScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'MileageVehicle'>) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 15, paddingBottom: insets.bottom + 30 }}
      keyboardShouldPersistTaps='handled'
    >
      <VehicleEditor
        vehicleId={route.params?.vehicleId}
        onSaved={() => navigation.goBack()}
      />
    </KeyboardAwareScrollView>
  )
}
