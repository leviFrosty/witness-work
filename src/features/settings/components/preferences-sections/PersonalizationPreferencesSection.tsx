import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Select from '@/components/ui/Select'
import { usePreferences } from '@/stores/preferences'
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
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'

const PersonalizationPreferencesSection = () => {
  const navigation = useNavigation<RootStackNavigation>()

  const { colorScheme, fontSizeOffset, set } = usePreferences()
  const fontSizeOffsetOptions = [
    { label: '-1', value: -1 },
    { label: '0', value: 0 },
    { label: '+1', value: 1 },
    { label: '+2', value: 2 },
    { label: '+3', value: 3 },
    { label: '+4', value: 4 },
  ]

  const darkModeOptions: {
    label: string
    value: 'light' | 'dark' | undefined
  }[] = [
    { label: i18n.t('device'), value: undefined },
    { label: i18n.t('dark'), value: 'dark' },
    { label: i18n.t('light'), value: 'light' },
  ]

  return (
    <View style={{ gap: 16 }}>
      <Section>
        <InputRowContainer
          label={i18n.t('colorScheme')}
          style={{ justifyContent: 'space-between' }}
        >
          <View style={{ flex: 1 }}>
            <Select
              data={darkModeOptions}
              value={colorScheme}
              onChange={({ value }) => set({ colorScheme: value })}
            />
          </View>
        </InputRowContainer>
        <InputRowContainer
          label={i18n.t('fontSizeOffset')}
          info={i18n.t('thisGloballyOffsetsTextSize')}
          style={{ justifyContent: 'space-between' }}
          lastInSection
        >
          <View style={{ flex: 1 }}>
            <Select
              data={fontSizeOffsetOptions}
              value={fontSizeOffset}
              onChange={({ value }) => set({ fontSizeOffset: value })}
            />
          </View>
        </InputRowContainer>
      </Section>
      <Section style={{ paddingHorizontal: 12, paddingVertical: 16 }}>
        <AccentColorPicker />
      </Section>
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
      )}
    </View>
  )
}

export default PersonalizationPreferencesSection
