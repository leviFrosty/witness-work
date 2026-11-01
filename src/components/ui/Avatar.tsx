import { User as UserIcon } from 'lucide-react-native'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Pressable, useWindowDimensions, View } from 'react-native'
import { Image } from 'expo-image'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import PointerHover from '@/components/ui/PointerHover'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import { ProfileAvatar } from '@/types/avatar'
import { useAvatarGroupSize } from '@/components/ui/AvatarGroup'
import { leftForPhysicalX } from '@/lib/direction'

export function isRenderableImageValue(value: string): boolean {
  if (!value) return false
  if (value.startsWith('icloud://')) return false
  return true
}

type AnchorRect = { x: number; y: number; size: number }

interface Props {
  avatar: ProfileAvatar
  name?: string

  size?: number

  background?: string

  focusable?: boolean

  loadFullImage?: () => Promise<string | null>

  children?: ReactNode
}

const AvatarSizeContext = createContext(44)

const Avatar = ({
  avatar,
  name,
  size: sizeProp,
  background,
  focusable,
  loadFullImage,
  children,
}: Props) => {
  const theme = useTheme()
  const groupSize = useAvatarGroupSize()
  const size = sizeProp ?? groupSize ?? 44
  const anchorRef = useRef<View>(null)
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const [open, setOpen] = useState(false)

  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [avatar.type, avatar.value])

  const [fullImage, setFullImage] = useState<{
    for: string
    uri: string
  } | null>(null)
  const fullUri =
    loadFullImage && fullImage?.for === avatar.value ? fullImage.uri : null
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
    if (loadFullImage && avatar.type === 'image') {
      const loadedFor = avatar.value
      void loadFullImage().then((uri) =>
        setFullImage(uri ? { for: loadedFor, uri } : null)
      )
    }
  }

  const target = Math.min(Math.min(dims.width - 48, dims.height * 0.5), 320)

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.92,
  }))

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
    if (
      avatar.type === 'image' &&
      isRenderableImageValue(avatar.value) &&
      !imageFailed
    ) {
      return (
        <Image
          source={{ uri: avatar.value }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.colors.border,
          }}
          contentFit='cover'
          cachePolicy='memory-disk'
          transition={120}
          onError={() => setImageFailed(true)}
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

    const bg = background ?? theme.colors.accentBackground

    if (avatar.type === 'emoji' && avatar.value) {
      return (
        <View style={{ ...base, backgroundColor: bg }}>
          {}
          <Text maxFontSizeMultiplier={1} style={{ fontSize: size * 0.5 }}>
            {avatar.value}
          </Text>
        </View>
      )
    }

    const initial = (name ?? '').trim().charAt(0).toUpperCase()

    if (initial) {
      return (
        <View style={{ ...base, backgroundColor: bg }}>
          <Text
            maxFontSizeMultiplier={1}
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
        <LucideIcon
          icon={UserIcon}
          size={size * 0.42}
          color={theme.colors.textInverse}
        />
      </View>
    )
  })()

  const content = children ? (
    <AvatarSizeContext.Provider value={size}>
      <View style={{ width: size, height: size }}>
        {inner}
        {children}
      </View>
    </AvatarSizeContext.Provider>
  ) : (
    inner
  )

  if (!focusable) return content

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <PointerHover effect='lift'>
          <Pressable
            onPress={handlePress}
            accessibilityRole='imagebutton'
            accessibilityLabel={i18n.t('profilePicture')}
            hitSlop={4}
            style={{ borderRadius: size / 2 }}
          >
            {}
            <View style={{ opacity: open ? 0 : 1 }}>{content}</View>
          </Pressable>
        </PointerHover>
      </View>
      {open && (
        <FullWindowOverlay onClose={close}>
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
            <Pressable
              testID='avatar-viewer-close'
              accessibilityRole='button'
              accessibilityLabel={i18n.t('close')}
              style={{ flex: 1 }}
              onPress={close}
            />
          </Animated.View>
          {anchor && (
            <Animated.View
              pointerEvents='none'
              style={[
                {
                  position: 'absolute',

                  left: leftForPhysicalX(anchor.x, anchor.size, dims.width),
                  top: anchor.y,
                  width: anchor.size,
                  height: anchor.size,
                },
                overlayStyle,
              ]}
            >
              {inner}
              {fullUri ? (
                <Image
                  source={{ uri: fullUri }}
                  style={{
                    position: 'absolute',
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                  }}
                  contentFit='cover'
                  allowDownscaling={false}
                  transition={200}
                />
              ) : null}
            </Animated.View>
          )}
        </FullWindowOverlay>
      )}
    </>
  )
}

export const AvatarBadge = ({
  color,
  icon,
  ringColor,
}: {
  color: string
  icon?: AppIcon

  ringColor?: string
}) => {
  const theme = useTheme()
  const avatarSize = useContext(AvatarSizeContext)
  const size = Math.max(8, Math.round(avatarSize * 0.42))
  const ring = 2

  return (
    <View
      style={{
        position: 'absolute',
        right: -ring,
        bottom: -ring,
        width: size + ring * 2,
        height: size + ring * 2,
        borderRadius: size / 2 + ring,
        borderWidth: ring,
        borderColor: ringColor ?? theme.colors.card,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon && size >= 10 ? (
        <LucideIcon
          icon={icon}
          size={Math.round(size * 0.8)}
          strokeWidth={3.5}
          color={theme.colors.textInverse}
        />
      ) : null}
    </View>
  )
}

export default Avatar
