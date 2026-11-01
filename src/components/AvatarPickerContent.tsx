import * as Crypto from 'expo-crypto'
import {
  Camera as CameraIcon,
  Check as CheckIcon,
  Link as LinkIcon,
  Trash2 as Trash2Icon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover from '@/components/ui/PointerHover'
import { useState } from 'react'
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native'
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
import { toast } from '@/stores/toasts'
import {
  originalSiblingFileName,
  revisionImageFileName,
  stripCacheBuster,
  withCacheBuster,
} from '@/lib/contactAvatarFiles'
import ContactAvatarCropEditor from '@/components/ContactAvatarCropEditor'
import { useAvatarDraftFiles } from '@/hooks/useAvatarDraftFiles'
import useLibraryImagePicker from '@/hooks/useLibraryImagePicker'

export type AvatarMetaCapture = {
  width: number
  height: number
  fileSize?: number
  capturedAt?: string
  croppedAt?: string
}

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

const DEFAULT_AVATAR_FILENAME = 'profile-avatar.jpg'

const EMOJI_COLS = 8
const EMOJI_CELL = 36
const EMOJI_GAP = 2
const SWATCH_SIZE = 24
const SWATCH_GAP = 8

const BACKGROUND_SWATCH_COUNT = ACCENT_PRESETS.length + 1
export const BACKGROUND_SWATCHES_WIDTH =
  BACKGROUND_SWATCH_COUNT * SWATCH_SIZE +
  (BACKGROUND_SWATCH_COUNT - 1) * SWATCH_GAP

interface Props {
  value: ProfileAvatar

  onChange: (next: ProfileAvatar) => void

  imageFileName?: string

  backgroundValue?: string | null

  onBackgroundChange: (next: string | null) => void

  onImageMeta?: (meta: AvatarMetaCapture) => void

  allowImage?: boolean
}

interface BackgroundSwatchesProps {
  value: string | null
  onChange: (next: string | null) => void
}

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
        <PointerHover effect='lift'>
          <Pressable
            onPress={() => onChange(null)}
            accessibilityRole='radio'
            accessibilityState={{ checked: value === null }}
            accessibilityLabel={i18n.t('avatarBackgroundMatchAccent')}
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
        </PointerHover>
        {ACCENT_PRESETS.slice(1).map((preset) => {
          const selected = preset.value === value
          return (
            <PointerHover key={preset.value} effect='lift'>
              <Pressable
                onPress={() => onChange(preset.value)}
                accessibilityRole='radio'
                accessibilityState={{ checked: selected }}
                accessibilityLabel={i18n.t(preset.name)}
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
            </PointerHover>
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
  allowImage = true,
  imageFileName = DEFAULT_AVATAR_FILENAME,
  backgroundValue = null,
  onBackgroundChange,
  onImageMeta,
}: Props) => {
  const theme = useTheme()
  const draftFiles = useAvatarDraftFiles()
  const library = useLibraryImagePicker('avatar')

  const [pendingPick, setPendingPick] = useState<{
    revision: string
    sourceUri: string
    destPath: string
    sourceWidth: number
    sourceHeight: number
    fileSize?: number
    capturedAt?: string
  } | null>(null)

  const pickEmoji = (emoji: string) => {
    onChange({ type: 'emoji', value: emoji })
  }

  const clearAvatar = () => {
    onChange({ type: 'none', value: '' })
  }

  const pickImage = async () => {
    if (Platform.OS === 'ios') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(
          i18n.t('permissionRequired'),
          i18n.t('photoPermissionNeeded')
        )
        return
      }
    }
    let result: ImagePicker.ImagePickerResult
    try {
      result = await library.pick({
        mediaTypes: ['images'],
        allowsEditing: false,
        exif: true,
        quality: 1,
      })
    } catch (e) {
      logger.error('Failed to pick an avatar image', e)
      toast.error(i18n.t('photoPicker_failed'))
      return
    }
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    const revision = Crypto.randomUUID()
    const originalPath = `${FileSystem.documentDirectory}${originalSiblingFileName(imageFileName, revision)}`
    const destPath = `${FileSystem.documentDirectory}${revisionImageFileName(imageFileName, revision)}`
    const paths = [originalPath, destPath]
    if (!draftFiles.claim(paths)) return
    try {
      await FileSystem.copyAsync({ from: asset.uri, to: originalPath })
      if (!draftFiles.owns(paths)) {
        draftFiles.release(paths)
        return
      }
    } catch (e) {
      draftFiles.release(paths)
      logger.error('Failed to save original avatar image', e)
      Alert.alert(i18n.t('error'), i18n.t('avatarSaveFailed'))
      return
    }

    setPendingPick({
      revision,
      sourceUri: originalPath,
      destPath,
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
    if (
      !draftFiles.commit([pendingPick.sourceUri, stripCacheBuster(next.path)])
    )
      return
    onChange({
      type: 'image',
      value: withCacheBuster(next.path),
      revision: pendingPick.revision,
    })
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
        analyticsSurface='avatar_background'
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
            <PointerHover key={emoji} effect='highlight'>
              <Pressable
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
            </PointerHover>
          )
        })}
      </View>
      {(allowImage || hasAvatar) && (
        <View style={{ height: 1, backgroundColor: theme.colors.border }} />
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {allowImage && (
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
        )}
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
      {library.host}
      {pendingPick && (
        <ContactAvatarCropEditor
          visible
          sourceUri={pendingPick.sourceUri}
          sourceWidth={pendingPick.sourceWidth}
          sourceHeight={pendingPick.sourceHeight}
          destPath={pendingPick.destPath}
          onClose={() => {
            draftFiles.release([pendingPick.sourceUri, pendingPick.destPath])
            setPendingPick(null)
          }}
          onCropped={handleCropped}
        />
      )}
    </View>
  )
}

function pickCapturedAt(exif: unknown): string | undefined {
  if (!exif || typeof exif !== 'object') return undefined
  const e = exif as Record<string, unknown>
  const raw = (e.DateTimeOriginal ?? e.DateTimeDigitized ?? e.DateTime) as
    | string
    | undefined
  if (!raw || typeof raw !== 'string') return undefined

  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/)
  if (!match) return undefined
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}`
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return undefined
  return new Date(t).toISOString()
}

export default AvatarPickerContent
