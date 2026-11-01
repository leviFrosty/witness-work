import { Check as CheckIcon } from 'lucide-react-native'
import { Pressable, View } from 'react-native'
import CustomColorSwatch from '@/components/CustomColorSwatch'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover from '@/components/ui/PointerHover'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'

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

export default function ColorSwatchPicker({
  value,
  defaultColor,
  onChange,
  title,
  size = 36,
}: {
  value: string | null

  defaultColor: string
  onChange: (next: string | null) => void

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
