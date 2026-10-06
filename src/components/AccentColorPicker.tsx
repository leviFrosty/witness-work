import IsSupporter from '@/components/IsSupporter'
import ColorSwatchPicker, {
  COLOR_PRESETS,
} from '@/components/ColorSwatchPicker'
import { usePreferences } from '@/stores/preferences'
import { lightModeColors } from '@/constants/theme'
import i18n from '@/lib/locales'

/** The default accent followed by the shared `COLOR_PRESETS`. */
export const ACCENT_PRESETS: { value: string; label: string }[] = [
  { value: lightModeColors.accent, label: 'default' },
  ...COLOR_PRESETS.map(({ value, label }) => ({ value, label })),
]

const PickerContents = () => {
  const { customAccentColor, set } = usePreferences()
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
