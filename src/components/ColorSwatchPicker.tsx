import { Check as CheckIcon } from 'lucide-react-native'
import { Pressable, View } from 'react-native'
import CustomColorSwatch from '@/components/CustomColorSwatch'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover from '@/components/ui/PointerHover'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'

/**
 * Curated colors offered wherever the app lets the User pick one, after that
 * picker's own default. Hex values are committed explicitly rather than pulled
 * from the active theme so the choice the user sees matches what gets stored —
 * independent of light/dark mode.
 */
export const COLOR_PRESETS: {
  value: string
  label: string
  name: TranslationKey
}[] = [
  { value: '#F59E0B', label: 'amber', name: 'colorAmber' },
  { value: '#EF4444', label: 'crimson', name: 'colorCrimson' },
  { value: '#EC4899', label: 'magenta', name: 'colorMagenta' },
  { value: '#A855F7', label: 'violet', name: 'colorViolet' },
  { value: '#3B82F6', label: 'blue', name: 'colorBlue' },
  { value: '#14B8A6', label: 'teal', name: 'colorTeal' },
]

const Swatch = ({
  color,
  label,
  selected,
  onPress,
  isDefault,
  size,
}: {
  color: string
  label: string
  selected: boolean
  onPress: () => void
  isDefault?: boolean
  size: number
}) => {
  const theme = useTheme()
  return (
    <PointerHover effect='lift'>
      <Pressable
        onPress={onPress}
        accessibilityRole='radio'
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: selected ? 3 : isDefault ? 1 : 0,
          borderColor: selected ? theme.colors.text : theme.colors.border,
        }}
      >
        {selected && (
          <LucideIcon
            icon={CheckIcon}
            size={Math.round(size * 0.4)}
            color={theme.colors.textInverse}
          />
        )}
      </Pressable>
    </PointerHover>
  )
}

/**
 * The app's color choice: the caller's default, the curated presets, and an
 * eyedropper for any other color. `value` is `null` while the default is in
 * use; choosing the default (or removing a custom color) reports `null`.
 */
export default function ColorSwatchPicker({
  value,
  defaultColor,
  onChange,
  title,
  size = 36,
}: {
  value: string | null
  /** What `null` looks like, e.g. the theme accent. */
  defaultColor: string
  onChange: (next: string | null) => void
  /** Shown above the custom color sheet. */
  title: string
  size?: number
}) {
  const presetValues = [defaultColor, ...COLOR_PRESETS.map((p) => p.value)]

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
      }}
    >
      <Swatch
        color={defaultColor}
        label={i18n.t('default')}
        selected={value === null || value === defaultColor}
        isDefault
        size={size}
        onPress={() => onChange(null)}
      />
      {COLOR_PRESETS.map((preset) => (
        <Swatch
          key={preset.value}
          color={preset.value}
          label={i18n.t(preset.name)}
          selected={preset.value === value}
          size={size}
          onPress={() => onChange(preset.value)}
        />
      ))}
      <CustomColorSwatch
        value={value}
        presetValues={presetValues}
        onChange={onChange}
        onRemove={() => onChange(null)}
        title={title}
        sheetInitialColor={value ?? defaultColor}
        size={size}
      />
    </View>
  )
}
