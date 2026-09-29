import { Pipette as PipetteIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useState } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import ColorPickerSheet from '@/components/ColorPickerSheet'
import ContextMenu from '@/components/ui/ContextMenu'
import i18n from '@/lib/locales'

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
  /**
   * Clears the custom color. When set, long-pressing an active custom swatch
   * offers Edit… and Remove (Remove is also reachable by picking a preset).
   */
  onRemove?: () => void
  /** Sent with long-press menu choices; defaults to `custom_color_swatch`. */
  analyticsSurface?: string
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
  onRemove,
  analyticsSurface = 'custom_color_swatch',
}: Props) => {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const isCustom = value !== null && !presetValues.includes(value)
  const iconSize = Math.round(size * 0.45)
  const selectedBorder = Math.max(2, Math.round(size / 12))

  return (
    <>
      {/* Only an active custom color that can be removed gets a menu; the
          idle eyedropper just opens the picker. */}
      <ContextMenu
        analyticsSurface={analyticsSurface}
        onPress={() => setOpen(true)}
        accessibilityLabel={title}
        actions={
          isCustom && onRemove
            ? [
                {
                  id: 'edit',
                  title: i18n.t('editEllipsis'),
                  systemImage: 'eyedropper',
                  onPress: () => setOpen(true),
                },
                {
                  id: 'remove',
                  title: i18n.t('remove'),
                  systemImage: 'xmark.circle',
                  onPress: onRemove,
                },
              ]
            : []
        }
      >
        <View
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
          <LucideIcon
            icon={PipetteIcon}
            size={iconSize}
            color={isCustom ? theme.colors.textInverse : theme.colors.text}
          />
        </View>
      </ContextMenu>
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
