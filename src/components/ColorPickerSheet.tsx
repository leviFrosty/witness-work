import { useEffect, useState } from 'react'
import { Modal, View } from 'react-native'
import { Sheet } from 'tamagui'
import ColorPicker, {
  HueSlider,
  Panel1,
  Preview,
} from 'reanimated-color-picker'
import { faTimes } from '@fortawesome/free-solid-svg-icons/faTimes'
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
 * Mirrors the `SupporterInfoSheet` presentation pattern: an RN `Modal`
 * (transparent + `statusBarTranslucent`) wraps a tamagui `Sheet` so callers can
 * present this from inside another RN `Modal` (AvatarPickerPopover) and from
 * inside a tamagui `Popover.Content` (ContactsStatsHeader) — both cases portal
 * correctly because the outer RN Modal hoists the sheet into a fresh UIWindow
 * above any host portal.
 */
const ColorPickerSheet = ({
  visible,
  value,
  onClose,
  onChange,
  title,
}: Props) => {
  const theme = useTheme()
  // Mirrors SupporterInfoSheet: keep the RN Modal mounted through the Sheet's
  // dismiss animation so the slide-down isn't interrupted.
  const [mounted, setMounted] = useState(visible)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      setDraft(value)
      return
    }
    const t = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(t)
  }, [visible, value])

  const handleDone = () => {
    onChange(draft)
    onClose()
  }

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType='none'
      onRequestClose={onClose}
    >
      <Sheet
        open={visible}
        onOpenChange={(next: boolean) => {
          if (!next) onClose()
        }}
        dismissOnSnapToBottom
        modal={false}
        snapPointsMode='fit'
      >
        <Sheet.Handle />
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame>
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
                icon={faTimes}
                size='lg'
                onPress={onClose}
              />
            </View>

            <ColorPicker
              value={value}
              sliderThickness={22}
              thumbSize={24}
              thumbShape='circle'
              boundedThumb
              onCompleteJS={(c) => setDraft(c.hex)}
              style={{ gap: 16 }}
            >
              <Preview hideText style={{ height: 36, borderRadius: 8 }} />
              <Panel1 style={{ borderRadius: 12 }} />
              <HueSlider style={{ borderRadius: 12 }} />
            </ColorPicker>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                variant='outline'
                onPress={onClose}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: theme.colors.text }}>
                  {i18n.t('cancel')}
                </Text>
              </Button>
              <Button
                onPress={handleDone}
                style={{
                  flex: 1,
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
          </View>
        </Sheet.Frame>
      </Sheet>
    </Modal>
  )
}

export default ColorPickerSheet
