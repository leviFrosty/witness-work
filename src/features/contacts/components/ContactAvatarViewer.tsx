import {
  Download as DownloadIcon,
  Info as InfoIcon,
  RotateCcw as RotateCcwIcon,
  Share as ShareIcon,
  SquarePen as SquarePenIcon,
  X as XIcon,
} from 'lucide-react-native'
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
import Spinner from '@/components/ui/Spinner'
import { Image } from 'expo-image'
import { GlassView } from 'expo-glass-effect'
import { BlurView } from '@/components/ui/BlurView'
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
import { formatDateTime } from '@/lib/dates'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import PointerHover from '@/components/ui/PointerHover'
import FloatingGlassButton from '@/components/ui/FloatingGlassButton'
import i18n from '@/lib/locales'
import { formatBytes } from '@/lib/formatBytes'
import { formatPlainNumber } from '@/lib/numbers'
import { Contact } from '@/types/contact'
import useContactAvatarActions from '@/features/contacts/hooks/useContactAvatarActions'
import { alignText } from '@/lib/direction'

interface Props {
  visible: boolean
  contact: Contact
  onClose: () => void
}

const ToolbarButton = ({
  icon,
  label,
  onPress,
  disabled,
  destructive,
}: {
  icon: typeof XIcon
  label: string
  onPress: () => void
  disabled?: boolean
  destructive?: boolean
}) => {
  const theme = useTheme()
  const tint = destructive ? '#ff6b6b' : '#fff'
  return (
    <PointerHover effect='highlight' enabled={!disabled}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityRole='button'
        hitSlop={6}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingVertical: 8,
          borderRadius: theme.numbers.borderRadiusMd,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <LucideIcon icon={icon} size={20} color={tint} />
        <Text style={{ color: tint, fontSize: 11 }}>{label}</Text>
      </Pressable>
    </PointerHover>
  )
}

const ContactAvatarViewer = ({ visible, contact, onClose }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const dims = useWindowDimensions()
  const [infoOpen, setInfoOpen] = useState(false)
  const {
    busy,
    hasOriginal,
    edit: handleEdit,
    save: handleSave,
    share: handleShare,
    reset: handleReset,
    editor,
  } = useContactAvatarActions(contact, visible)

  const fitSize = useMemo(() => {
    const horizontalRoom = dims.width - 24
    const verticalRoom = dims.height - insets.top - insets.bottom - 200
    return Math.min(horizontalRoom, verticalRoom)
  }, [dims, insets])

  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const savedTx = useSharedValue(0)
  const savedTy = useSharedValue(0)

  useEffect(() => {
    if (!visible) return
    scale.value = 1
    tx.value = 0
    ty.value = 0
    savedScale.value = 1
    savedTx.value = 0
    savedTy.value = 0
  }, [visible, scale, tx, ty, savedScale, savedTx, savedTy])

  const clampTranslate = (
    s: number,
    nextTx: number,
    nextTy: number
  ): { x: number; y: number } => {
    'worklet'
    const overflow = Math.max(0, (fitSize * s - fitSize) / 2)
    return {
      x: Math.min(overflow, Math.max(-overflow, nextTx)),
      y: Math.min(overflow, Math.max(-overflow, nextTy)),
    }
  }

  const pan = Gesture.Pan()
    .enableTrackpadTwoFingerGesture(true)
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
      const nextScale = Math.max(1, Math.min(6, savedScale.value * e.scale))
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

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const target = scale.value > 1.05 ? 1 : 2.5
      scale.value = withTiming(target, { duration: 220 })
      tx.value = withTiming(0, { duration: 220 })
      ty.value = withTiming(0, { duration: 220 })
      savedScale.value = target
      savedTx.value = 0
      savedTy.value = 0
    })

  const composed = Gesture.Race(doubleTap, Gesture.Simultaneous(pan, pinch))

  const imageStyle = useAnimatedStyle(() => ({
    width: fitSize,
    height: fitSize,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }))

  const displayedUri = contact.avatar?.value

  if (!displayedUri) return null

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
        {}
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
          <FloatingGlassButton
            icon={XIcon}
            onPress={onClose}
            label={i18n.t('cancel')}
          />
          <FloatingGlassButton
            icon={InfoIcon}
            onPress={() => setInfoOpen((v) => !v)}
            label={i18n.t('photoInfo')}
          />
        </View>

        {}
        <GestureDetector gesture={composed}>
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Animated.View style={imageStyle}>
              <Image
                source={{ uri: displayedUri }}
                style={{ width: fitSize, height: fitSize }}
                contentFit='cover'
                cachePolicy='memory-disk'
                transition={120}
              />
            </Animated.View>
          </View>
        </GestureDetector>

        {}
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: insets.bottom + 12,
            borderRadius: 32,
            borderCurve: 'continuous',
            overflow: 'hidden',
          }}
        >
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
              paddingVertical: 10,
              paddingHorizontal: 6,
              flexDirection: 'row',
            }}
          >
            <ToolbarButton
              icon={SquarePenIcon}
              label={i18n.t('editPhoto')}
              onPress={handleEdit}
              disabled={busy}
            />
            <ToolbarButton
              icon={DownloadIcon}
              label={i18n.t('savePhoto')}
              onPress={handleSave}
              disabled={busy}
            />
            <ToolbarButton
              icon={ShareIcon}
              label={i18n.t('sharePhoto')}
              onPress={handleShare}
              disabled={busy}
            />
            <ToolbarButton
              icon={RotateCcwIcon}
              label={i18n.t('resetPhoto')}
              onPress={handleReset}
              disabled={busy || !hasOriginal}
            />
          </View>
        </View>

        {busy && (
          <View
            pointerEvents='none'
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Spinner size='large' color='#fff' />
          </View>
        )}

        {}
        {infoOpen && (
          <Pressable
            onPress={() => setInfoOpen(false)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.4)',
              zIndex: 20,
            }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                borderRadius: theme.numbers.borderRadiusMd,
                overflow: 'hidden',
                minWidth: 260,
                maxWidth: dims.width - 48,
              }}
            >
              {}
              <BlurView
                tint='systemThickMaterialDark'
                intensity={70}
                style={StyleSheet.absoluteFill}
              />
              <GlassView
                glassEffectStyle='regular'
                colorScheme='dark'
                style={StyleSheet.absoluteFill}
              />
              <View style={{ padding: 20, gap: 12 }}>
                <Text
                  style={{
                    fontFamily: theme.fonts.bold,
                    fontSize: 16,
                    color: '#fff',
                  }}
                >
                  {i18n.t('photoInfo')}
                </Text>
                <InfoRow
                  label={i18n.t('resolution')}
                  value={
                    contact.avatarMeta
                      ? `${formatPlainNumber(contact.avatarMeta.width)} × ${formatPlainNumber(contact.avatarMeta.height)}`
                      : '—'
                  }
                />
                <InfoRow
                  label={i18n.t('fileSize')}
                  value={formatBytes(contact.avatarMeta?.fileSize)}
                />
                <InfoRow
                  label={i18n.t('capturedAt')}
                  value={
                    contact.avatarMeta?.capturedAt
                      ? formatDateTime(contact.avatarMeta.capturedAt)
                      : '—'
                  }
                />
                <InfoRow
                  label={i18n.t('addedAt')}
                  value={
                    contact.avatarMeta?.croppedAt
                      ? formatDateTime(contact.avatarMeta.croppedAt)
                      : '—'
                  }
                />
                {!hasOriginal && (
                  <Text
                    style={{
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.7)',
                      fontStyle: 'italic',
                    }}
                  >
                    {i18n.t('originalUnavailable')}
                  </Text>
                )}
                <Pressable
                  onPress={() => setInfoOpen(false)}
                  style={{
                    alignSelf: 'flex-end',
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                  }}
                >
                  <Text
                    style={{
                      color: '#fff',
                      fontFamily: theme.fonts.semiBold,
                      fontSize: 14,
                    }}
                  >
                    {i18n.t('doneLabel')}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        )}

        {editor}
      </GestureHandlerRootView>
    </Modal>
  )
}

const InfoRow = ({ label, value }: { label: string; value: string }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
        {label}
      </Text>
      <Text
        style={{
          color: '#fff',
          fontSize: 13,
          fontFamily: theme.fonts.semiBold,
          flexShrink: 1,
          textAlign: alignText('end'),
        }}
      >
        {value}
      </Text>
    </View>
  )
}

export default ContactAvatarViewer
