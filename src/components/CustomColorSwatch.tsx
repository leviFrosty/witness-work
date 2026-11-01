import { Pipette as PipetteIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useState } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import ColorPickerSheet from '@/components/ColorPickerSheet'
import ContextMenu from '@/components/ui/ContextMenu'
import i18n from '@/lib/locales'

interface Props {
  value: string | null

  presetValues: string[]

  onChange: (hex: string) => void

  title: string

  sheetInitialColor: string

  size?: number

  onRemove?: () => void
}

const CustomColorSwatch = ({
  value,
  presetValues,
  onChange,
  title,
  sheetInitialColor,
  size = 24,
  onRemove,
}: Props) => {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const isCustom = value !== null && !presetValues.includes(value)
  const iconSize = Math.round(size * 0.45)
  const selectedBorder = Math.max(2, Math.round(size / 12))

  return (
    <>
      {}
      <ContextMenu
        onPress={() => setOpen(true)}
        accessibilityLabel={title}
        pointerEffect='lift'
        hoverRadius={size / 2}
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
