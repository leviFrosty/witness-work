import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  StatusBar,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPencil } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import { ProfileAvatar } from '../types/avatar'
import Avatar from './Avatar'
import AvatarPickerContent from './AvatarPickerContent'
import i18n from '../lib/locales'

type AnchorRect = { x: number; y: number; width: number; height: number }

interface Props {
  /** Currently-selected avatar to render in the anchor + drive picker state. */
  value: ProfileAvatar
  /** Persisted by the caller (preferences for the user, contact store per-row). */
  onChange: (next: ProfileAvatar) => void
  /** Display name used for the initial-letter fallback in the avatar preview. */
  name?: string
  /** Pixel size of the rendered avatar. */
  size?: number
  /**
   * Filename used by the picker when persisting an image to
   * `FileSystem.documentDirectory`. Each consumer should pass a unique name.
   */
  imageFileName?: string
  /** Background color for the avatar circle when emoji/letter fallback. */
  background?: string
  /** Show the accent-tone background swatches. Profile-only by default. */
  showBackgroundSwatches?: boolean
  /** Accessibility label for the tappable anchor. Defaults to "profilePicture". */
  accessibilityLabel?: string
}

/**
 * Tappable avatar that opens an inline picker above the avatar.
 *
 * Built on top of React Native's `Modal` (new UIWindow) rather than tamagui
 * `Popover` (portals to root RN view) so the popover remains visible when the
 * parent screen is presented as a native modal / form sheet. Tamagui's Portal
 * mounts behind those presentations and so its content is never visible.
 */
const AvatarPickerPopover = ({
  value,
  onChange,
  name,
  size = 44,
  imageFileName,
  background,
  showBackgroundSwatches = false,
  accessibilityLabel,
}: Props) => {
  const theme = useTheme()
  const anchorRef = useRef<View>(null)
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const [open, setOpen] = useState(false)
  const dims = useWindowDimensions()
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: 140 })
  }, [open, progress])

  const handlePress = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
      setOpen(true)
    })
  }

  const close = () => setOpen(false)

  const handleChange = (next: ProfileAvatar) => {
    onChange(next)
    close()
  }

  // Width of the picker content (8 cols × 36 cell + 7 × 2 gap) plus padding.
  const contentWidth = 8 * 36 + 7 * 2 + 24

  const popoverStyle = (() => {
    if (!anchor) return { top: 0, left: 0 }
    const margin = 12
    const preferredLeft = anchor.x
    const left = Math.min(
      Math.max(margin, preferredLeft),
      dims.width - contentWidth - margin
    )
    const top = anchor.y + anchor.height + 8
    return { top, left }
  })()

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }))

  const contentStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.96 + 0.04 * progress.value }],
  }))

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <Pressable
          accessibilityLabel={accessibilityLabel ?? i18n.t('profilePicture')}
          accessibilityRole='button'
          onPress={handlePress}
          hitSlop={8}
        >
          <View>
            <Avatar
              avatar={value}
              name={(name ?? '').trim()}
              size={size}
              background={background}
            />
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: theme.colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: theme.colors.card,
              }}
            >
              <FontAwesomeIcon
                icon={faPencil}
                size={8}
                color={theme.colors.textInverse}
              />
            </View>
          </View>
        </Pressable>
      </View>
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType='none'
        onRequestClose={close}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.2)',
            },
            backdropStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={close} />
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: contentWidth,
              borderRadius: theme.numbers.borderRadiusMd,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              padding: 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
            },
            popoverStyle,
            contentStyle,
          ]}
        >
          <AvatarPickerContent
            value={value}
            onChange={handleChange}
            imageFileName={imageFileName}
            showBackgroundSwatches={showBackgroundSwatches}
          />
        </Animated.View>
        <StatusBar translucent />
      </Modal>
    </>
  )
}

export default AvatarPickerPopover
