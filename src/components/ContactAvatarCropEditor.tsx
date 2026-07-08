import { RotateCcw as RotateCcwIcon, X as XIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useEffect, useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { GlassView } from 'expo-glass-effect'
import { BlurView } from 'expo-blur'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import i18n from '@/lib/locales'
import {
  CropRect,
  cropAndSaveImage,
  stripCacheBuster,
  withCacheBuster,
} from '@/lib/contactAvatarFiles'
import { logger } from '@/lib/logger'

interface Props {
  visible: boolean
  /** Source image URI (no cache-buster). Should be the original where possible. */
  sourceUri: string
  sourceWidth: number
  sourceHeight: number
  /** Absolute on-disk path where the cropped JPEG should be written. */
  destPath: string
  onClose: () => void
  /**
   * Called after a successful crop. Receives the dest path with cache buster
   * (suitable for `<Image>` and `Contact.avatar.value`).
   */
  onCropped: (next: { path: string; width: number; height: number }) => void
}

const FRAME_MARGIN = 24
const HEADER_BTN_SIZE = 36

/**
 * Circular glass header button. Floats over imagery so we layer a `BlurView`
 * underneath the `GlassView` per AGENTS.md ("free-floating elements that would
 * visually disappear without the material") — on iOS 26 the GlassView paints
 * over the blur; on older systems the blur stays visible.
 */
const GlassHeaderButton = ({
  icon,
  iconSize = 16,
  onPress,
  label,
}: {
  icon: typeof XIcon
  iconSize?: number
  onPress: () => void
  label: string
}) => {
  const shape = {
    width: HEADER_BTN_SIZE,
    height: HEADER_BTN_SIZE,
    borderRadius: HEADER_BTN_SIZE / 2,
    overflow: 'hidden' as const,
  }
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityLabel={label}
      accessibilityRole='button'
    >
      <View style={shape}>
        <BlurView
          tint='systemThickMaterialDark'
          intensity={50}
          style={StyleSheet.absoluteFill}
        />
        <GlassView
          glassEffectStyle='regular'
          colorScheme='dark'
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            ...shape,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}
        >
          <LucideIcon icon={icon} size={iconSize} color='#fff' />
        </View>
      </View>
    </Pressable>
  )
}

/**
 * Square-crop editor with pinch + pan gestures. Image lives under a fixed
 * square frame; the user moves the image to choose what falls inside the frame.
 * Mirrors the iOS Photos crop interaction at a high level (square only; we
 * don't expose aspect-ratio toggles since avatars are round).
 *
 * Math: positions/scales are kept on the worklet thread as shared values.
 * `baseScale` is the minimum scale that lets the image fully cover the frame
 * (gesture handlers clamp scale below this so the user can never expose
 * letterbox). Everything else is derived from `(scale, tx, ty)` plus the source
 * dimensions.
 */
const ContactAvatarCropEditor = ({
  visible,
  sourceUri,
  sourceWidth,
  sourceHeight,
  destPath,
  onClose,
  onCropped,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const dims = useWindowDimensions()
  const [busy, setBusy] = useState(false)

  const frameSize = Math.min(
    dims.width - FRAME_MARGIN * 2,
    dims.height - insets.top - insets.bottom - 280
  )

  const baseScale = useMemo(() => {
    if (!sourceWidth || !sourceHeight) return 1
    return frameSize / Math.min(sourceWidth, sourceHeight)
  }, [frameSize, sourceWidth, sourceHeight])

  // Callers pass a stable file path (e.g. `…-avatar-original.jpg`) whose
  // contents change when the user picks a new image. Append a fresh
  // cache-buster whenever the source path or visibility flips so expo-image
  // re-reads from disk instead of returning a stale cached bitmap. Using
  // state + effect (vs `useMemo` with `Date.now()`) keeps the render pure and
  // satisfies the React Compiler ESLint plugin.
  const [displayUri, setDisplayUri] = useState(
    () => `${stripCacheBuster(sourceUri)}?t=${Date.now()}`
  )
  useEffect(() => {
    if (!visible) return
    setDisplayUri(`${stripCacheBuster(sourceUri)}?t=${Date.now()}`)
  }, [visible, sourceUri])

  const scale = useSharedValue(baseScale)
  const savedScale = useSharedValue(baseScale)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const savedTx = useSharedValue(0)
  const savedTy = useSharedValue(0)

  const resetTransform = (animated = true) => {
    if (animated) {
      scale.value = withTiming(baseScale, { duration: 200 })
      tx.value = withTiming(0, { duration: 200 })
      ty.value = withTiming(0, { duration: 200 })
    } else {
      scale.value = baseScale
      tx.value = 0
      ty.value = 0
    }
    savedScale.value = baseScale
    savedTx.value = 0
    savedTy.value = 0
  }

  // Re-init the transform whenever the visible source or its base scale
  // changes. Inlined (vs calling `resetTransform`) so React Compiler can see
  // the shared-value writes directly and we don't need to suppress the
  // exhaustive-deps lint.
  useEffect(() => {
    if (!visible) return
    scale.value = baseScale
    tx.value = 0
    ty.value = 0
    savedScale.value = baseScale
    savedTx.value = 0
    savedTy.value = 0
  }, [
    visible,
    baseScale,
    sourceUri,
    scale,
    tx,
    ty,
    savedScale,
    savedTx,
    savedTy,
  ])

  /**
   * Clamp translation so the image always covers the frame. After scaling by
   * `s`, the image's displayed size is (srcW_s, srcH_s); the half-overflow on
   * each side is (displayed - frame) / 2 — that's the maximum |translate|.
   */
  const clampTranslate = (
    s: number,
    nextTx: number,
    nextTy: number
  ): { x: number; y: number } => {
    'worklet'
    const dispW = sourceWidth * s
    const dispH = sourceHeight * s
    const maxX = Math.max(0, (dispW - frameSize) / 2)
    const maxY = Math.max(0, (dispH - frameSize) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, nextTx)),
      y: Math.min(maxY, Math.max(-maxY, nextTy)),
    }
  }

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const next = clampTranslate(
        scale.value,
        savedTx.value + e.translationX,
        savedTy.value + e.translationY
      )
      tx.value = next.x
      ty.value = next.y
    })
    .onEnd(() => {
      savedTx.value = tx.value
      savedTy.value = ty.value
    })

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const nextScale = Math.max(
        baseScale,
        Math.min(baseScale * 6, savedScale.value * e.scale)
      )
      scale.value = nextScale
      const next = clampTranslate(nextScale, savedTx.value, savedTy.value)
      tx.value = next.x
      ty.value = next.y
    })
    .onEnd(() => {
      savedScale.value = scale.value
      savedTx.value = tx.value
      savedTy.value = ty.value
    })

  const composed = Gesture.Simultaneous(pan, pinch)

  const imageStyle = useAnimatedStyle(() => ({
    width: sourceWidth,
    height: sourceHeight,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }))

  const handleReset = () => {
    Haptics.selectionAsync().catch(() => {})
    resetTransform(true)
  }

  const handleApply = async () => {
    if (busy) return
    setBusy(true)
    try {
      const s = scale.value
      // Crop side in source pixels (frameSize on screen / scale).
      const cropSide = frameSize / s
      // Source-pixel coordinate at the frame's center: source center minus the
      // pan offset converted from screen pixels back to source pixels.
      const sourceCenterX = sourceWidth / 2 - tx.value / s
      const sourceCenterY = sourceHeight / 2 - ty.value / s
      const rect: CropRect = {
        originX: sourceCenterX - cropSide / 2,
        originY: sourceCenterY - cropSide / 2,
        width: cropSide,
        height: cropSide,
      }
      const result = await cropAndSaveImage(sourceUri, destPath, rect, {
        width: sourceWidth,
        height: sourceHeight,
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      )
      onCropped({
        path: withCacheBuster(result.path),
        width: result.width,
        height: result.height,
      })
    } catch (e) {
      logger.error('Failed to apply crop', e)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {}
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle='light-content' />
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <View
          style={{
            position: 'absolute',
            top: insets.top + 6,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 10,
          }}
        >
          <GlassHeaderButton
            icon={XIcon}
            onPress={onClose}
            label={i18n.t('cancel')}
          />

          <Text
            style={{
              color: '#fff',
              fontSize: 15,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('cropPhoto')}
          </Text>

          <GlassHeaderButton
            icon={RotateCcwIcon}
            iconSize={14}
            onPress={handleReset}
            label={i18n.t('reset')}
          />
        </View>

        <GestureDetector gesture={composed}>
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Animated.View
              style={[
                {
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                imageStyle,
              ]}
            >
              <Image
                source={{ uri: displayUri }}
                style={{ width: sourceWidth, height: sourceHeight }}
                contentFit='cover'
                cachePolicy='memory-disk'
              />
            </Animated.View>
            {/* Crop frame overlay (above the image, below the gesture catcher).
                pointerEvents='none' lets the gestures pass through. */}
            <View
              pointerEvents='none'
              style={{
                position: 'absolute',
                width: frameSize,
                height: frameSize,
                borderRadius: frameSize / 2,
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.95)',
                shadowColor: '#000',
                shadowOpacity: 0.6,
                shadowRadius: 22,
              }}
            />
            <View
              pointerEvents='none'
              style={{
                position: 'absolute',
                width: frameSize,
                height: frameSize,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.4)',
              }}
            />
          </View>
        </GestureDetector>

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: insets.bottom + 24,
            paddingHorizontal: 24,
            gap: 12,
          }}
        >
          <Text
            style={{
              color: 'rgba(255,255,255,0.75)',
              textAlign: 'center',
              fontSize: 12,
            }}
          >
            {i18n.t('cropPhotoHint')}
          </Text>
          <ActionButton
            variant='glass'
            glassTint={theme.colors.accent}
            onPress={handleApply}
            disabled={busy}
          >
            {i18n.t('applyCrop')}
          </ActionButton>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

export default ContactAvatarCropEditor
