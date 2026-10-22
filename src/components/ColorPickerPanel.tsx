import ColorPicker, {
  HueSlider,
  Panel1,
  Preview,
} from 'reanimated-color-picker'

interface Props {
  /** Hex (or any colorKit-supported format) the picker starts at. */
  value: string
  /** Fires with the hex each time the user lets go of a slider or the panel. */
  onComplete: (hex: string) => void
}

/** `ColorPickerSheet`'s picker, which it loads the first time it opens. */
const ColorPickerPanel = ({ value, onComplete }: Props) => (
  <ColorPicker
    value={value}
    sliderThickness={22}
    thumbSize={24}
    thumbShape='circle'
    boundedThumb
    onCompleteJS={(c) => onComplete(c.hex)}
    style={{ gap: 16 }}
  >
    <Preview hideText style={{ height: 36, borderRadius: 8 }} />
    <Panel1 style={{ borderRadius: 12 }} />
    <HueSlider style={{ borderRadius: 12 }} />
  </ColorPicker>
)

export default ColorPickerPanel
