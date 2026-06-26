import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  Modal,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import * as MediaLibrary from 'expo-media-library'
import * as Haptics from 'expo-haptics'
import { GlassView } from 'expo-glass-effect'
import { BlurView } from 'expo-blur'
import { useToastController } from '@tamagui/toast'
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
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  faArrowUpFromBracket,
  faCircleInfo,
  faDownload,
  faPenToSquare,
  faRotateLeft,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { formatDateTime } from '@/lib/dates'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import { Contact } from '@/types/contact'
import useContacts from '@/stores/contactsStore'
import {
  cropAndSaveAvatar,
  croppedAvatarPath,
  defaultCenteredSquareCrop,
  originalAvatarPath,
  originalExists,
  stripCacheBuster,
  withCacheBuster,
} from '@/lib/contactAvatarFiles'
import { logger } from '@/lib/logger'
import ContactAvatarCropEditor from '@/components/ContactAvatarCropEditor'

interface Props {
  visible: boolean
  contact: Contact
  onClose: () => void
}

const HEADER_BUTTON_SIZE = 40

/**
 * Round glass header button. Floats over imagery so we layer a `BlurView`
 * underneath the `GlassView` per AGENTS.md guidance ("free-floating elements
 * that would visually disappear without the material") — on iOS 26 the
 * `GlassView` paints over the blur fallback; on older systems the blur stays
 * visible so the icon doesn't disappear into the photo behind it.
 */
const HeaderButton = ({
  icon,
  onPress,
  label,
}: {
  icon: typeof faXmark
  onPress: () => void
  label: string
}) => {
  const shape = {
    width: HEADER_BUTTON_SIZE,
    height: HEADER_BUTTON_SIZE,
    borderRadius: HEADER_BUTTON_SIZE / 2,
    overflow: 'hidden' as const,
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole='button'
      hitSlop={10}
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
          <FontAwesomeIcon icon={icon} size={16} color='#fff' />
        </View>
      </View>
    </Pressable>
  )
}

const ToolbarButton = ({
  icon,
  label,
  onPress,
  disabled,
  destructive,
}: {
  icon: typeof faXmark
  label: string
  onPress: () => void
  disabled?: boolean
  destructive?: boolean
}) => {
  const tint = destructive ? '#ff6b6b' : '#fff'
  return (
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
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <FontAwesomeIcon icon={icon} size={20} color={tint} />
      <Text style={{ color: tint, fontSize: 11 }}>{label}</Text>
    </Pressable>
  )
}

/**
 * Full-screen contact-avatar viewer.
 *
 * Tap on a contact's image avatar from `ContactDetailsScreen` opens this
 * viewer. Behaviour parallels the iOS Photos full-screen view: pinch + pan +
 * double-tap zoom, plus a toolbar of contact-photo-specific actions (edit crop,
 * save to library, share, reset to default centered crop) and an "i" popover
 * surfacing capture/resolution metadata.
 *
 * The viewer reads the displayed image from `contact.avatar.value`; for the
 * crop editor it prefers the locally-saved original (full quality) and falls
 * back to the displayed image when no original exists (legacy contacts).
 */
const ContactAvatarViewer = ({ visible, contact, onClose }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const dims = useWindowDimensions()
  const { updateContact } = useContacts()
  const toast = useToastController()

  const [infoOpen, setInfoOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hasOriginal, setHasOriginal] = useState(false)

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    originalExists(contact.id).then((exists) => {
      if (!cancelled) setHasOriginal(exists)
    })
    return () => {
      cancelled = true
    }
  }, [visible, contact.id, contact.avatar?.value])

  const fitSize = useMemo(() => {
    const horizontalRoom = dims.width - 24
    const verticalRoom = dims.height - insets.top - insets.bottom - 200
    return Math.min(horizontalRoom, verticalRoom)
  }, [dims, insets])

  // Gesture state. The cropped avatar is square, so "fit" is just a single
  // dimension and translate clamps are symmetrical in x and y.
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const savedTx = useSharedValue(0)
  const savedTy = useSharedValue(0)

  // Snap shared-value transforms back to fit when the viewer opens. Inlined
  // so React Compiler can see the writes without us suppressing the
  // exhaustive-deps rule.
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
      // Toggle between fit (1x) and a comfortable 2.5x magnification.
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
  const editableSource = useMemo(() => {
    if (hasOriginal) {
      const path = originalAvatarPath(contact.id)
      return { uri: path, isOriginal: true }
    }
    if (displayedUri) {
      return { uri: stripCacheBuster(displayedUri), isOriginal: false }
    }
    return null
  }, [hasOriginal, displayedUri, contact.id])

  const [editableDims, setEditableDims] = useState<{
    width: number
    height: number
  } | null>(null)

  // Probe pixel dimensions of the editable source when the user opens the
  // editor. Avatar metadata gives us the original's dimensions; for the
  // fallback (cropped image) we ask expo-image at edit time.
  const ensureEditableDims = async (): Promise<{
    width: number
    height: number
  } | null> => {
    if (editableDims) return editableDims
    if (!editableSource) return null
    if (editableSource.isOriginal && contact.avatarMeta) {
      const d = {
        width: contact.avatarMeta.width,
        height: contact.avatarMeta.height,
      }
      setEditableDims(d)
      return d
    }
    return new Promise((resolve) => {
      RNImage.getSize(
        editableSource.uri,
        (width, height) => {
          const d = { width, height }
          setEditableDims(d)
          resolve(d)
        },
        () => resolve(null)
      )
    })
  }

  const handleEdit = async () => {
    Haptics.selectionAsync().catch(() => {})
    const d = await ensureEditableDims()
    if (!d) {
      Alert.alert(i18n.t('error'), i18n.t('avatarSaveFailed'))
      return
    }
    setEditorOpen(true)
  }

  const handleSave = async () => {
    if (!displayedUri || busy) return
    setBusy(true)
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true)
      if (!perm.granted) {
        Alert.alert(
          i18n.t('permissionRequired'),
          i18n.t('photoLibraryWritePermissionNeeded')
        )
        return
      }
      await MediaLibrary.saveToLibraryAsync(stripCacheBuster(displayedUri))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      )
      toast.show(i18n.t('success'), {
        message: i18n.t('savedToPhotos'),
        native: true,
      })
    } catch (e) {
      logger.error('Failed to save avatar to photos', e)
      Alert.alert(i18n.t('error'), i18n.t('savePhotoFailed'))
    } finally {
      setBusy(false)
    }
  }

  const handleShare = async () => {
    if (!displayedUri) return
    Haptics.selectionAsync().catch(() => {})
    try {
      await Share.share({
        url: stripCacheBuster(displayedUri),
        title: contact.name,
      })
    } catch (e) {
      logger.warn('Share avatar failed or was cancelled', e)
    }
  }

  const handleReset = async () => {
    if (busy) return
    Alert.alert(
      i18n.t('resetPhoto_question'),
      i18n.t('resetPhoto_description'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('reset'),
          onPress: async () => {
            setBusy(true)
            try {
              const exists = await originalExists(contact.id)
              if (!exists || !contact.avatarMeta) {
                Alert.alert(i18n.t('error'), i18n.t('originalUnavailable'))
                return
              }
              const sourcePath = originalAvatarPath(contact.id)
              const source = {
                width: contact.avatarMeta.width,
                height: contact.avatarMeta.height,
              }
              const rect = defaultCenteredSquareCrop(source)
              const result = await cropAndSaveAvatar(
                sourcePath,
                contact.id,
                rect,
                source
              )
              updateContact({
                id: contact.id,
                avatar: { type: 'image', value: withCacheBuster(result.path) },
                avatarMeta: {
                  ...contact.avatarMeta,
                  croppedAt: new Date().toISOString(),
                },
              })
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              ).catch(() => {})
            } catch (e) {
              logger.error('Failed to reset crop', e)
              Alert.alert(i18n.t('error'), i18n.t('avatarSaveFailed'))
            } finally {
              setBusy(false)
            }
          },
        },
      ]
    )
  }

  const handleCropped = (next: {
    path: string
    width: number
    height: number
  }) => {
    updateContact({
      id: contact.id,
      avatar: { type: 'image', value: next.path },
      avatarMeta: contact.avatarMeta
        ? {
            ...contact.avatarMeta,
            croppedAt: new Date().toISOString(),
          }
        : undefined,
    })
    setEditorOpen(false)
  }

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
        {/* Header */}
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
          <HeaderButton
            icon={faXmark}
            onPress={onClose}
            label={i18n.t('cancel')}
          />
          <HeaderButton
            icon={faCircleInfo}
            onPress={() => setInfoOpen((v) => !v)}
            label={i18n.t('photoInfo')}
          />
        </View>

        {/* Image with gestures */}
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

        {/* Toolbar — a floating capsule that sits above the home indicator.
            Glass material on iOS 26 with a BlurView fallback so the icons
            stay legible against bright photos on older systems. The rounded
            shape matches Apple HIG for floating glass surfaces; the GlassView
            edge highlight reads correctly on a capsule and looks off on a
            full-width rectangular strip. */}
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
              icon={faPenToSquare}
              label={i18n.t('editPhoto')}
              onPress={handleEdit}
              disabled={busy}
            />
            <ToolbarButton
              icon={faDownload}
              label={i18n.t('savePhoto')}
              onPress={handleSave}
              disabled={busy}
            />
            <ToolbarButton
              icon={faArrowUpFromBracket}
              label={i18n.t('sharePhoto')}
              onPress={handleShare}
              disabled={busy}
            />
            <ToolbarButton
              icon={faRotateLeft}
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
            <ActivityIndicator size='large' color='#fff' />
          </View>
        )}

        {/* Info popover */}
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
              {/* Popover surface — glass on iOS 26, blur fallback elsewhere.
                  AGENTS.md flags popovers as a primary glass-target surface. */}
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
                      ? `${contact.avatarMeta.width} × ${contact.avatarMeta.height}`
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

        {editableSource && editableDims && (
          <ContactAvatarCropEditor
            visible={editorOpen}
            sourceUri={editableSource.uri}
            sourceWidth={editableDims.width}
            sourceHeight={editableDims.height}
            destPath={croppedAvatarPath(contact.id)}
            onClose={() => setEditorOpen(false)}
            onCropped={handleCropped}
          />
        )}
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
          textAlign: 'right',
        }}
      >
        {value}
      </Text>
    </View>
  )
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default ContactAvatarViewer
