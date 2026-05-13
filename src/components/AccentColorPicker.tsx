import { Pressable, View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import useTheme from '@/contexts/theme'
import Text from '@/components/MyText'
import IsSupporter from '@/components/IsSupporter'
import CustomColorSwatch from '@/components/CustomColorSwatch'
import { usePreferences } from '@/stores/preferences'
import { lightModeColors } from '@/constants/theme'
import i18n from '@/lib/locales'

/**
 * Curated palette for supporter-selected accent overrides. Hex values are
 * committed explicitly rather than pulled from the active theme so the choice
 * the user sees matches what gets stored — independent of light/dark mode.
 */
export const ACCENT_PRESETS: { value: string; label: string }[] = [
  { value: lightModeColors.accent, label: 'default' },
  { value: '#F59E0B', label: 'amber' },
  { value: '#EF4444', label: 'crimson' },
  { value: '#EC4899', label: 'magenta' },
  { value: '#A855F7', label: 'violet' },
  { value: '#3B82F6', label: 'blue' },
  { value: '#14B8A6', label: 'teal' },
]

const Swatch = ({
  color,
  selected,
  onPress,
  isDefault,
}: {
  color: string
  selected: boolean
  onPress: () => void
  isDefault?: boolean
}) => {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: selected ? 3 : isDefault ? 1 : 0,
        borderColor: selected ? theme.colors.text : theme.colors.border,
      }}
    >
      {selected && (
        <FontAwesomeIcon
          icon={faCheck}
          size={14}
          color={theme.colors.textInverse}
        />
      )}
    </Pressable>
  )
}

const PickerContents = () => {
  const theme = useTheme()
  const { customAccentColor, set } = usePreferences()

  const selectedValue = customAccentColor ?? ACCENT_PRESETS[0].value

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
          paddingVertical: 4,
        }}
      >
        {ACCENT_PRESETS.map((preset) => {
          const isDefault = preset.value === ACCENT_PRESETS[0].value
          const selected =
            preset.value === selectedValue ||
            (isDefault && customAccentColor === null)
          return (
            <Swatch
              key={preset.value}
              color={preset.value}
              selected={selected}
              isDefault={isDefault}
              onPress={() =>
                set({
                  customAccentColor: isDefault ? null : preset.value,
                })
              }
            />
          )
        })}
        <CustomColorSwatch
          value={customAccentColor}
          presetValues={ACCENT_PRESETS.map((p) => p.value)}
          onChange={(hex) => set({ customAccentColor: hex })}
          title={i18n.t('accentColor')}
          sheetInitialColor={selectedValue}
          size={36}
        />
      </View>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('accentColorHelp')}
      </Text>
    </View>
  )
}

const AccentColorPicker = () => (
  <IsSupporter
    feature='customAccentColor'
    size='md'
    title={i18n.t('accentColor')}
  >
    <PickerContents />
  </IsSupporter>
)

export default AccentColorPicker
