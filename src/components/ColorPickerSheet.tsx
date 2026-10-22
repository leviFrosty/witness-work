import { X as XIcon } from 'lucide-react-native'
import { useEffect, useState, type ComponentProps } from 'react'
import { View } from 'react-native'
import Sheet from '@/components/ui/Sheet'
import type ColorPickerPanelComponent from '@/components/ColorPickerPanel'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import i18n from '@/lib/locales'

interface Props {
  visible: boolean
  /** Hex (or any colorKit-supported format) used as the picker's starting value. */
  value: string
  onClose: () => void
  /**
   * Fires once when the user confirms ("Done"). Commit-on-close — not on every
   * drag — so callers can keep their persistence stores quiet during scrubbing
   * (and avoids flooding any animated subtree with intermediate hex updates).
   */
  onChange: (hex: string) => void
  /** Optional sheet title shown above the picker. */
  title?: string
}

/**
 * Bottom-sheet color picker built on `reanimated-color-picker`. Replaces the
 * SwiftUI `Host` + `ColorPicker` bridge that crashed when mounted inside any
 * Reanimated-animated subtree (folly::dynamic UAF during shadow-tree commit).
 *
 * The native sheet presents above whatever it's opened from, so it also works
 * from inside a popover's RN `Modal` (AvatarPickerPopover,
 * ContactsStalenessChips). Dismissing it or its close button discards the
 * change; Done keeps it.
 */
const ColorPickerSheet = ({
  visible,
  value,
  onClose,
  onChange,
  title,
}: Props) => {
  const theme = useTheme()
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (visible) setDraft(value)
  }, [visible, value])

  const handleDone = () => {
    onChange(draft)
    onClose()
  }

  return (
    <Sheet
      open={visible}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <View style={{ padding: 20, paddingBottom: 32, gap: 16 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('lg'),
              color: theme.colors.text,
            }}
          >
            {title ?? ''}
          </Text>
          <IconButton
            noTransform
            frame
            icon={XIcon}
            size='lg'
            onPress={onClose}
          />
        </View>

        <ColorPickerPanel value={value} onComplete={setDraft} />

        <Button
          onPress={handleDone}
          style={{
            paddingVertical: 12,
            backgroundColor: theme.colors.accent,
            borderRadius: theme.numbers.borderRadiusSm,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('done')}
          </Text>
        </Button>
      </View>
    </Sheet>
  )
}

/**
 * Loads reanimated-color-picker when the sheet first opens (the sheet mounts
 * its content only then) rather than at launch with every screen that hosts a
 * swatch, Home's profile card included.
 */
function ColorPickerPanel(
  props: ComponentProps<typeof ColorPickerPanelComponent>
) {
  const Panel: typeof ColorPickerPanelComponent =
    require('@/components/ColorPickerPanel').default
  return <Panel {...props} />
}

export default ColorPickerSheet
