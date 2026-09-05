import { View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import useTheme from '@/contexts/theme'
import type { RootStackParamList } from '@/types/rootStack'
import MileageDashboard from '@/features/mileage/components/MileageDashboard'

export default function MileageScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'Mileage'>) {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <MileageDashboard initialPeriod={route.params?.period} />
    </View>
  )
}
