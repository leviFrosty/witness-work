import { useNavigation } from '@react-navigation/native'
import { Settings as SettingsIcon } from 'lucide-react-native'
import { View, type LayoutChangeEvent } from 'react-native'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'

export default function RoutineSettingsButton({
  onLayout,
}: {
  onLayout?: (event: LayoutChangeEvent) => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const label = i18n.t('routine.home.settings')
  return (
    <View style={{ position: 'absolute', right: 0 }} onLayout={onLayout}>
      <PointerTooltip label={label}>
        <IconButton
          icon={SettingsIcon}
          size='xl'
          accessibilityLabel={label}
          iconStyle={{ color: theme.colors.text }}
          onPress={() => navigation.navigate('RoutineSettings')}
        />
      </PointerTooltip>
    </View>
  )
}
