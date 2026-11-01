import IsSupporter from '@/components/IsSupporter'
import ColorSwatchPicker, {
  COLOR_PRESETS,
} from '@/components/ColorSwatchPicker'
import { usePreferences } from '@/stores/preferences'
import { lightModeColors } from '@/constants/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { useShallow } from 'zustand/react/shallow'

export const ACCENT_PRESETS: {
  value: string
  label: string
  name: TranslationKey
}[] = [
  { value: lightModeColors.accent, label: 'default', name: 'default' },
  ...COLOR_PRESETS.map(({ value, label, name }) => ({ value, label, name })),
]

const PickerContents = () => {
  const { customAccentColor, set } = usePreferences(
    useShallow((s) => ({ customAccentColor: s.customAccentColor, set: s.set }))
  )
  return (
    <ColorSwatchPicker
      value={customAccentColor}
      defaultColor={ACCENT_PRESETS[0].value}
      onChange={(next) => set({ customAccentColor: next })}
      title={i18n.t('accentColor')}
    />
  )
}

const AccentColorPicker = () => (
  <IsSupporter
    analyticsSurface='accent_color'
    feature='customAccentColor'
    size='md'
    title={i18n.t('accentColor')}
  >
    <PickerContents />
  </IsSupporter>
)

export default AccentColorPicker
