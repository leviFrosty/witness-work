import {
  Camera as CameraIcon,
  Check as CheckIcon,
  Link as LinkIcon,
  Trash2 as Trash2Icon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useState } from 'react'
import { Alert, Pressable, ScrollView, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import useTheme from '@/contexts/theme'
import { ProfileAvatar } from '@/types/avatar'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import IsSupporter from '@/components/IsSupporter'
import { ACCENT_PRESETS } from '@/components/AccentColorPicker'
import CustomColorSwatch from '@/components/CustomColorSwatch'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import {
  originalSiblingFileName,
  withCacheBuster,
} from '@/lib/contactAvatarFiles'
import ContactAvatarCropEditor from '@/components/ContactAvatarCropEditor'

export type AvatarMetaCapture = {
  width: number
  height: number
  fileSize?: number
  capturedAt?: string
  croppedAt?: string
}

/**
 * Curated grid of emojis. Keeps the picker offline and zero-dep — the native
 * iOS emoji keyboard has no public programmatic invocation, so we ship a small,
 * appropriate set instead of pulling a third-party library.
 */
const EMOJI_OPTIONS = [
  '😊',
  '😃',
  '😄',
  '🙂',
  '🥰',
  '😎',
  '🤓',
  '🫶',
  '🤗',
  '🌹',
  '📖',
  '📚',
  '✨',
  '⭐',
  '🌟',
  '💫',
  '🌱',
  '🌿',
  '🌷',
  '🌸',
  '🌻',
  '🌳',
  '🌺',
  '🌈',
  '🐑',
  '🦋',
  '🐝',
  '🐢',
  '🐠',
  '🦉',
  '🐶',
  '🐱',
  '❤️',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '🤍',
  '💖',
  '🎯',
  '🔑',
  '💡',
  '📍',
  '🗺️',
  '🏠',
  '✉️',
  '🌍',
]

/** Default filename inside FileSystem.documentDirectory for the user's profile. */
const DEFAULT_AVATAR_FILENAME = 'profile-avatar.jpg'

const EMOJI_COLS = 8
const EMOJI_CELL = 36
const EMOJI_GAP = 2
const SWATCH_SIZE = 24
const SWATCH_GAP = 8
/**
 * Rendered count = 1 ("match accent" pseudo-swatch) + (ACCENT_PRESETS.length -
 *
 * 1. Non-default presets + 1 eyedropper. Kept as a derived constant so the
 *    containing popover sizes itself to fit the row exactly.
 */
const BACKGROUND_SWATCH_COUNT = ACCENT_PRESETS.length + 1
export const BACKGROUND_SWATCHES_WIDTH =
  BACKGROUND_SWATCH_COUNT * SWATCH_SIZE +
  (BACKGROUND_SWATCH_COUNT - 1) * SWATCH_GAP

interface Props {
  /** Currently-selected avatar (drives the highlighted state in the grid). */
  value: ProfileAvatar
  /**
   * Called with the next avatar after the user picks an emoji, image, or
   * clears.
   */
  onChange: (next: ProfileAvatar) => void
  /**
   * Filename used for the persisted image inside
   * `FileSystem.documentDirectory`. Each consumer (profile, per-contact) should
   * pass a unique name so picks don't trample each other's files.
   */
  imageFileName?: string
  /** Currently-selected background override (null = match accent). */
  backgroundValue?: string | null
  /** Called when the user picks a different swatch. */
  onBackgroundChange: (next: string | null) => void
  /**
   * Optional callback invoked alongside `onChange` when the user picks an image
   * — surfaces the metadata (resolution / file size / capture time) needed by
   * the contact-details "i" popover. Callers that don't track this (e.g. the
   * user's profile avatar) can omit it.
   */
  onImageMeta?: (meta: AvatarMetaCapture) => void
}

interface BackgroundSwatchesProps {
  value: string | null
  onChange: (next: string | null) => void
}

/**
 * Compact horizontal swatch row shown above the emoji grid. The first swatch
 * ("match accent") clears the override and is rendered in the current accent
 * tone so the user can see what matching resolves to. Only rendered when the
 * avatar is a non-image type, since image avatars ignore the background color
 * entirely.
 */
export const BackgroundSwatches = ({
  value,
  onChange,
}: BackgroundSwatchesProps) => {
  const theme = useTheme()
  const selectedColor = value ?? theme.colors.accent
  const presetValues = ACCENT_PRESETS.slice(1).map((p) => p.value)

  return (
    <View style={{ gap: 6 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, height: SWATCH_SIZE }}
        contentContainerStyle={{
          alignItems: 'center',
          gap: SWATCH_GAP,
          paddingVertical: 0,
        }}
      >
        <Pressable
          onPress={() => onChange(null)}
          style={{
            width: SWATCH_SIZE,
            height: SWATCH_SIZE,
            borderRadius: SWATCH_SIZE / 2,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: value === null ? 2 : 1,
            borderColor:
              value === null ? theme.colors.text : theme.colors.border,
          }}
        >
          <LucideIcon
            icon={value === null ? CheckIcon : LinkIcon}
            size={10}
            color={theme.colors.textInverse}
          />
        </Pressable>
        {ACCENT_PRESETS.slice(1).map((preset) => {
          const selected = preset.value === value
          return (
            <Pressable
              key={preset.value}
              onPress={() => onChange(preset.value)}
              style={{
                width: SWATCH_SIZE,
                height: SWATCH_SIZE,
                borderRadius: SWATCH_SIZE / 2,
                backgroundColor: preset.value,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: selected ? 2 : 0,
                borderColor: selected ? theme.colors.text : 'transparent',
              }}
            >
              {selected && (
                <LucideIcon
                  icon={CheckIcon}
                  size={10}
                  color={theme.colors.textInverse}
                />
              )}
            </Pressable>
          )
        })}
        <CustomColorSwatch
          value={value}
          presetValues={presetValues}
          onChange={(hex) => onChange(hex)}
          title={i18n.t('avatarBackgroundColor')}
          sheetInitialColor={selectedColor}
          size={SWATCH_SIZE}
        />
      </ScrollView>
    </View>
  )
}

const AvatarPickerContent = ({
  value,
  onChange,
  imageFileName = DEFAULT_AVATAR_FILENAME,
  backgroundValue = null,
  onBackgroundChange,
  onImageMeta,
}: Props) => {
  const theme = useTheme()
  const destPath = `${FileSystem.documentDirectory}${imageFileName}`
  const originalPath = `${FileSystem.documentDirectory}${originalSiblingFileName(imageFileName)}`

  /**
   * Pending pick that's awaiting user crop. Holds enough state to render the
   * crop editor and to commit metadata after the user finishes cropping. Null
   * when no pick is in flight (the picker is idle).
   */
  const [pendingPick, setPendingPick] = useState<{
    sourceUri: string
    sourceWidth: number
    sourceHeight: number
    fileSize?: number
    capturedAt?: string
  } | null>(null)

  const deleteStoredImage = async () => {
    if (value.type !== 'image' || !value.value) return
    const path = value.value.split('?')[0]
    for (const p of [path, originalPath]) {
      try {
        await FileSystem.deleteAsync(p, { idempotent: true })
      } catch (e) {
        logger.warn('Failed to delete previous avatar image', p, e)
      }
    }
  }

  const pickEmoji = async (emoji: string) => {
    await deleteStoredImage()
    onChange({ type: 'emoji', value: emoji })
  }

  const clearAvatar = async () => {
    await deleteStoredImage()
    onChange({ type: 'none', value: '' })
  }

  /**
   * Two-stage flow:
   *
   * 1. Picker returns the un-cropped source. We persist it as the "original" so
   *    the user can reframe later from the contact-details viewer without
   *    quality loss.
   * 2. Open our crop editor on that original. Initial frame is centered square;
   *    user can pinch / pan to choose a different framing. The editor's
   *    `onCropped` writes the final JPEG and we commit the avatar.
   */
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(i18n.t('permissionRequired'), i18n.t('photoPermissionNeeded'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      exif: true,
      quality: 1,
    })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    try {
      await FileSystem.deleteAsync(originalPath, { idempotent: true })
      await FileSystem.copyAsync({ from: asset.uri, to: originalPath })
    } catch (e) {
      logger.error('Failed to save original avatar image', e)
      Alert.alert(i18n.t('error'), i18n.t('avatarSaveFailed'))
      return
    }

    setPendingPick({
      sourceUri: originalPath,
      sourceWidth: asset.width,
      sourceHeight: asset.height,
      fileSize: asset.fileSize,
      capturedAt: pickCapturedAt(asset.exif),
    })
  }

  const handleCropped = (next: {
    path: string
    width: number
    height: number
  }) => {
    if (!pendingPick) return
    onChange({ type: 'image', value: withCacheBuster(next.path) })
    onImageMeta?.({
      width: pendingPick.sourceWidth,
      height: pendingPick.sourceHeight,
      fileSize: pendingPick.fileSize,
      capturedAt: pendingPick.capturedAt,
      croppedAt: new Date().toISOString(),
    })
    setPendingPick(null)
  }

  const hasAvatar = value.type !== 'none' && !!value.value
  const gridWidth = EMOJI_COLS * EMOJI_CELL + (EMOJI_COLS - 1) * EMOJI_GAP

  return (
    <View style={{ width: gridWidth, gap: 12 }}>
      <IsSupporter
        feature='customAccentColor'
        size='sm'
        title={i18n.t('avatarBackgroundColor')}
      >
        <BackgroundSwatches
          value={backgroundValue}
          onChange={onBackgroundChange}
        />
      </IsSupporter>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: EMOJI_GAP,
        }}
      >
        {EMOJI_OPTIONS.map((emoji) => {
          const selected = value.type === 'emoji' && value.value === emoji
          return (
            <Pressable
              key={emoji}
              onPress={() => pickEmoji(emoji)}
              style={{
                width: EMOJI_CELL,
                height: EMOJI_CELL,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                backgroundColor: selected
                  ? theme.colors.accentBackground
                  : 'transparent',
              }}
            >
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </Pressable>
          )
        })}
      </View>
      <View style={{ height: 1, backgroundColor: theme.colors.border }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          variant='outline'
          onPress={pickImage}
          style={{
            flex: 1,
            paddingVertical: 10,
            gap: 8,
            justifyContent: 'center',
          }}
        >
          <LucideIcon icon={CameraIcon} size={13} color={theme.colors.text} />
          <Text style={{ color: theme.colors.text, fontSize: 14 }}>
            {i18n.t('choosePhoto')}
          </Text>
        </Button>
        {hasAvatar && (
          <Button
            variant='outline'
            onPress={clearAvatar}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              gap: 8,
              justifyContent: 'center',
            }}
          >
            <LucideIcon icon={Trash2Icon} size={13} color={theme.colors.text} />
            <Text style={{ color: theme.colors.text, fontSize: 14 }}>
              {i18n.t('remove')}
            </Text>
          </Button>
        )}
      </View>
      {pendingPick && (
        <ContactAvatarCropEditor
          visible
          sourceUri={pendingPick.sourceUri}
          sourceWidth={pendingPick.sourceWidth}
          sourceHeight={pendingPick.sourceHeight}
          destPath={destPath}
          onClose={() => setPendingPick(null)}
          onCropped={handleCropped}
        />
      )}
    </View>
  )
}

/**
 * Best-effort capture-time extraction from EXIF. The picker returns either no
 * EXIF (when iOS denies access or the asset is screen-recorded), or a record
 * with `DateTimeOriginal` / `DateTimeDigitized` in EXIF format `"YYYY:MM:DD
 * HH:MM:SS"`. Anything else returns undefined.
 */
function pickCapturedAt(exif: unknown): string | undefined {
  if (!exif || typeof exif !== 'object') return undefined
  const e = exif as Record<string, unknown>
  const raw = (e.DateTimeOriginal ?? e.DateTimeDigitized ?? e.DateTime) as
    | string
    | undefined
  if (!raw || typeof raw !== 'string') return undefined
  // EXIF: "2024:11:30 14:23:01" → ISO "2024-11-30T14:23:01"
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/)
  if (!match) return undefined
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}`
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return undefined
  return new Date(t).toISOString()
}

export default AvatarPickerContent
