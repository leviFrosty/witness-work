import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Car as CarIcon, Fuel as FuelIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import LogTripButton from '@/features/mileage/components/LogTripButton'
import type { MileageSource, RootStackNavigation } from '@/types/rootStack'

type Props = {
  /**
   * `noCars` (default) asks for the first car; `noTrips` fills an empty period;
   * `costHint` points to fuel setup when trips have no estimated cost.
   */
  variant?: 'noCars' | 'noTrips' | 'costHint'
  source?: MileageSource
}

export default function MileageEmptyState({
  variant = 'noCars',
  source = 'mileage_screen',
}: Props) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  if (variant === 'costHint') {
    return (
      <Button
        onPress={() => navigation.navigate('MileageSettings')}
        accessibilityRole='button'
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 4,
        }}
      >
        <LucideIcon icon={FuelIcon} size={16} color={theme.colors.accent} />
        <Text
          style={{
            flex: 1,
            color: theme.colors.accent,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('mileage.costHint')}
        </Text>
      </Button>
    )
  }

  if (variant === 'noTrips') {
    return (
      <Text
        style={{
          color: theme.colors.textAlt,
          textAlign: 'center',
          paddingVertical: 24,
        }}
      >
        {i18n.t('mileage.noTrips')}
      </Text>
    )
  }

  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 16 }}>
      <LucideIcon icon={CarIcon} size={32} color={theme.colors.textAlt} />
      <Text
        style={{
          color: theme.colors.textAlt,
          textAlign: 'center',
        }}
      >
        {i18n.t('mileage.noCars')}
      </Text>
      <LogTripButton
        label={i18n.t('mileage.addFirstCar')}
        onPress={() => navigation.navigate('MileageVehicleForm', { source })}
        style={{ alignSelf: 'stretch' }}
      />
    </View>
  )
}
