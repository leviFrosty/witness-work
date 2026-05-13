import { useState } from 'react'
import { Pressable } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faEyeDropper } from '@fortawesome/free-solid-svg-icons'
import useTheme from '@/contexts/theme'
import ColorPickerSheet from '@/components/ColorPickerSheet'

interface Props {
  /** Currently-stored color, or null when nothing custom is set. */
  value: string | null
  /**
   * Hex values reserved by sibling preset swatches. When `value` matches one of
   * these, the eyedropper renders idle so the active state shows on the
   * matching preset instead of duplicating here.
   */
  presetValues: string[]
  /** Fires with the chosen hex when the user confirms in the sheet. */
  onChange: (hex: string) => void
  /** Title shown above the reanimated color picker sheet. */
  title: string
  /** Color the sheet opens at when no custom value is active yet. */
  sheetInitialColor: string
  /** Diameter of the swatch; icon and selected border scale with this. */
  size?: number
}

/**
 * Eyedropper trigger that opens a `ColorPickerSheet` and renders an active
 * state when the stored color isn't one of the sibling presets — i.e. the user
 * picked a hex outside the curated palette. Shared between `AccentColorPicker`
 * and `AvatarPickerContent`'s background row.
 */
const CustomColorSwatch = ({
  value,
  presetValues,
  onChange,
  title,
  sheetInitialColor,
  size = 24,
}: Props) => {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const isCustom = value !== null && !presetValues.includes(value)
  const iconSize = Math.round(size * 0.45)
  const selectedBorder = Math.max(2, Math.round(size / 12))

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: isCustom ? selectedBorder : 1,
          borderColor: isCustom ? theme.colors.text : theme.colors.border,
          backgroundColor: isCustom ? value : theme.colors.backgroundLighter,
        }}
      >
        <FontAwesomeIcon
          icon={faEyeDropper}
          size={iconSize}
          color={isCustom ? theme.colors.textInverse : theme.colors.text}
        />
      </Pressable>
      <ColorPickerSheet
        visible={open}
        value={isCustom ? value : sheetInitialColor}
        onClose={() => setOpen(false)}
        onChange={onChange}
        title={title}
      />
    </>
  )
}

export default CustomColorSwatch
