import { useEffect, useRef, useState } from 'react'
import {
  Image,
  Modal,
  Pressable,
  StatusBar,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faUser } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import Text from './MyText'
import { ProfileAvatar } from '../types/avatar'

/**
 * Whether an `avatar.value` string actually resolves to something `<Image>` can
 * render. Returns false for:
 *
 * - Empty strings (`type === 'image'` with no value yet)
 * - ICloud markers (`icloud://contact-<id>` / `icloud://profile`) — these are
 *   placeholders that travel on the synced payload while the binary downloads
 *   in the background. Before the download lands (or if the sender turned image
 *   sync off, so the binary will never land), the avatar should render as the
 *   initials fallback — see Q3 / Q4 in `docs/icloud-image-sync-plan.md`.
 */
function isRenderableImageValue(value: string): boolean {
  if (!value) return false
  if (value.startsWith('icloud://')) return false
  return true
}

type AnchorRect = { x: number; y: number; size: number }

interface Props {
  avatar: ProfileAvatar
  name?: string
  size?: number
  /** Background of the circle when avatar is an emoji or letter fallback. */
  background?: string
  /**
   * When true, tapping the avatar animates it from its on-screen position to a
   * centered, scaled-up presentation over a dim backdrop. Tap (or hardware
   * back) dismisses with the reverse animation.
   */
  focusable?: boolean
}

const Avatar = ({ avatar, name, size = 44, background, focusable }: Props) => {
  const theme = useTheme()
  const anchorRef = useRef<View>(null)
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const [open, setOpen] = useState(false)
  const progress = useSharedValue(0)
  const dims = useWindowDimensions()

  useEffect(() => {
    if (open) progress.value = withTiming(1, { duration: 240 })
  }, [open, progress])

  const close = () => {
    progress.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) runOnJS(setOpen)(false)
    })
  }

  const handlePress = () => {
    anchorRef.current?.measureInWindow((x, y, w) => {
      setAnchor({ x, y, size: w })
      setOpen(true)
    })
  }

  // Target presentation: centered, sized to fit comfortably within the screen
  // with breathing room on the smaller dimension. Caps at 320pt so the
  // presentation feels intentional rather than balloon-large on tablets.
  const target = Math.min(Math.min(dims.width - 48, dims.height * 0.5), 320)

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.92,
  }))

  // Transform-based morph: keep the rendered Avatar at its source size and
  // animate translate + scale so its visual center reaches the screen center
  // and grows to `target`. This works uniformly for image / emoji / letter
  // fallbacks since `transform: scale` scales all child content.
  const overlayStyle = useAnimatedStyle(() => {
    if (!anchor) return { opacity: 0 }
    const targetScale = target / anchor.size
    const scale = interpolate(progress.value, [0, 1], [1, targetScale])
    const tx = interpolate(
      progress.value,
      [0, 1],
      [0, dims.width / 2 - (anchor.x + anchor.size / 2)]
    )
    const ty = interpolate(
      progress.value,
      [0, 1],
      [0, dims.height / 2 - (anchor.y + anchor.size / 2)]
    )
    return {
      opacity: 1,
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
    }
  })

  const inner = (() => {
    if (avatar.type === 'image' && isRenderableImageValue(avatar.value)) {
      return (
        <Image
          source={{ uri: avatar.value }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.colors.border,
          }}
        />
      )
    }

    const base = {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    }

    if (avatar.type === 'emoji' && avatar.value) {
      return (
        <View
          style={{
            ...base,
            backgroundColor: background ?? theme.colors.accentBackground,
          }}
        >
          <Text style={{ fontSize: size * 0.5 }}>{avatar.value}</Text>
        </View>
      )
    }

    const bg = background ?? theme.colors.accent
    const initial = (name ?? '').trim().charAt(0).toUpperCase()

    if (initial) {
      return (
        <View style={{ ...base, backgroundColor: bg }}>
          <Text
            style={{
              fontSize: size * 0.42,
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {initial}
          </Text>
        </View>
      )
    }

    return (
      <View style={{ ...base, backgroundColor: bg }}>
        <FontAwesomeIcon
          icon={faUser}
          size={size * 0.42}
          color={theme.colors.textInverse}
        />
      </View>
    )
  })()

  if (!focusable) return inner

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <Pressable
          onPress={handlePress}
          accessibilityRole='imagebutton'
          hitSlop={4}
        >
          {/* Hide the source while the overlay is presenting so we don't
              briefly see a duplicate next to the animated copy. */}
          <View style={{ opacity: open ? 0 : 1 }}>{inner}</View>
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
              backgroundColor: '#000',
            },
            backdropStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={close} />
        </Animated.View>
        {anchor && (
          <Animated.View
            pointerEvents='none'
            style={[
              {
                position: 'absolute',
                left: anchor.x,
                top: anchor.y,
                width: anchor.size,
                height: anchor.size,
              },
              overlayStyle,
            ]}
          >
            {inner}
          </Animated.View>
        )}
        <StatusBar translucent />
      </Modal>
    </>
  )
}

export default Avatar
