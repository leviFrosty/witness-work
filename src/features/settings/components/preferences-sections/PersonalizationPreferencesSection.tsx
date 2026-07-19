import {
  ChevronRight as ChevronRightIcon,
  Palette as PaletteIcon,
  Shapes as ShapesIcon,
} from 'lucide-react-native'
import { Platform, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import IconButton from '@/components/ui/IconButton'
import AccentColorPicker from '@/components/AccentColorPicker'
import Divider from '@/components/ui/Divider'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'

const PersonalizationPreferencesSection = () => {
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <View style={{ gap: 3 }}>
      <Section style={{ paddingLeft: 20, paddingRight: 20 }} noPadding>
        <AccentColorPicker />
      </Section>
      <Divider marginVertical={20} />
      <Section>
        <InputRowButton
          leftIcon={PaletteIcon}
          label={i18n.t('colorKeyScreenTitle')}
          onPress={() => navigation.navigate('PreferencesColorKey')}
          lastInSection
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
      </Section>
      {Platform.OS === 'ios' && (
        <>
          <Divider marginVertical={20} />
          <Section>
            <InputRowButton
              leftIcon={ShapesIcon}
              label={i18n.t('appIconScreenTitle')}
              onPress={() => navigation.navigate('PreferencesAppIcon')}
              lastInSection
            >
              <IconButton icon={ChevronRightIcon} />
            </InputRowButton>
          </Section>
        </>
      )}
    </View>
  )
}

export default PersonalizationPreferencesSection
