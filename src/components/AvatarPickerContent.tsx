import { Alert, Pressable, ScrollView, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  faCamera,
  faCheck,
  faLink,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import { usePreferences } from '../stores/preferences'
import Text from './MyText'
import Button from './Button'
import IsSupporter from './IsSupporter'
import { ACCENT_PRESETS } from './AccentColorPicker'
import i18n from '../lib/locales'
import { logger } from '../lib/logger'

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
  '🙏',
  '🕊️',
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
  '🍀',
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

/**
 * Filename inside FileSystem.documentDirectory. A single fixed path keeps the
 * user's on-device footprint to exactly one avatar image — replacing the avatar
 * overwrites the old file.
 */
const AVATAR_FILENAME = 'profile-avatar.jpg'

const EMOJI_COLS = 8
const EMOJI_CELL = 36
const EMOJI_GAP = 2
const SWATCH_SIZE = 24

interface Props {
  /** Fired after a pick or clear succeeds — lets callers close the popover. */
  onPicked?: () => void
}

/**
 * Compact horizontal swatch row shown above the emoji grid. The first swatch
 * ("match accent") clears the override and is rendered in the current accent
 * tone so the user can see what matching resolves to. Only rendered when the
 * avatar is a non-image type, since image avatars ignore the background color
 * entirely.
 */
const BackgroundSwatches = () => {
  const theme = useTheme()
  const { customAvatarBackground, set } = usePreferences()

  return (
    <View style={{ gap: 6 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        <Pressable
          onPress={() => set({ customAvatarBackground: null })}
          style={{
            width: SWATCH_SIZE,
            height: SWATCH_SIZE,
            borderRadius: SWATCH_SIZE / 2,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: customAvatarBackground === null ? 2 : 1,
            borderColor:
              customAvatarBackground === null
                ? theme.colors.text
                : theme.colors.border,
          }}
        >
          <FontAwesomeIcon
            icon={customAvatarBackground === null ? faCheck : faLink}
            size={10}
            color={theme.colors.textInverse}
          />
        </Pressable>
        {ACCENT_PRESETS.slice(1).map((preset) => {
          const selected = preset.value === customAvatarBackground
          return (
            <Pressable
              key={preset.value}
              onPress={() => set({ customAvatarBackground: preset.value })}
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
                <FontAwesomeIcon
                  icon={faCheck}
                  size={10}
                  color={theme.colors.textInverse}
                />
              )}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const AvatarPickerContent = ({ onPicked }: Props) => {
  const theme = useTheme()
  const { avatar, set } = usePreferences()
  // Image avatars ignore the background color, so hide the swatches entirely
  // in that case rather than showing an inert control. Non-image avatars get
  // the full picker, gated behind `IsSupporter` for non-supporters.
  const showBackgroundSwatches = avatar.type !== 'image'

  const deleteStoredImage = async () => {
    if (avatar.type !== 'image' || !avatar.value) return
    try {
      const path = avatar.value.split('?')[0]
      await FileSystem.deleteAsync(path, { idempotent: true })
    } catch (e) {
      logger.warn('Failed to delete previous avatar image', e)
    }
  }

  const pickEmoji = async (emoji: string) => {
    await deleteStoredImage()
    set({ avatar: { type: 'emoji', value: emoji } })
    onPicked?.()
  }

  const clearAvatar = async () => {
    await deleteStoredImage()
    set({ avatar: { type: 'none', value: '' } })
    onPicked?.()
  }

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(i18n.t('permissionRequired'), i18n.t('photoPermissionNeeded'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return

    const src = result.assets[0].uri
    const destPath = `${FileSystem.documentDirectory}${AVATAR_FILENAME}`
    try {
      await FileSystem.deleteAsync(destPath, { idempotent: true })
      await FileSystem.copyAsync({ from: src, to: destPath })
    } catch (e) {
      logger.error('Failed to save avatar image', e)
      Alert.alert(i18n.t('error'), i18n.t('avatarSaveFailed'))
      return
    }
    // Cache-buster so <Image> reloads when the same path is reused.
    set({ avatar: { type: 'image', value: `${destPath}?t=${Date.now()}` } })
    onPicked?.()
  }

  const hasAvatar = avatar.type !== 'none' && !!avatar.value
  const gridWidth = EMOJI_COLS * EMOJI_CELL + (EMOJI_COLS - 1) * EMOJI_GAP

  return (
    <View style={{ width: gridWidth, gap: 12 }}>
      {showBackgroundSwatches && (
        <IsSupporter
          feature='customAccentColor'
          size='sm'
          title={i18n.t('avatarBackgroundColor')}
        >
          <BackgroundSwatches />
        </IsSupporter>
      )}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: EMOJI_GAP,
        }}
      >
        {EMOJI_OPTIONS.map((emoji) => {
          const selected = avatar.type === 'emoji' && avatar.value === emoji
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
          <FontAwesomeIcon
            icon={faCamera}
            size={13}
            color={theme.colors.text}
          />
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
            <FontAwesomeIcon
              icon={faTrash}
              size={13}
              color={theme.colors.text}
            />
            <Text style={{ color: theme.colors.text, fontSize: 14 }}>
              {i18n.t('remove')}
            </Text>
          </Button>
        )}
      </View>
    </View>
  )
}

export default AvatarPickerContent
