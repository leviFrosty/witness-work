import { useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import { Popover } from 'tamagui'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faCamera, faTrash } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import { usePreferences } from '../stores/preferences'
import Avatar from './Avatar'
import Text from './MyText'
import Button from './Button'
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

const AvatarPicker = () => {
  const theme = useTheme()
  const { avatar, name, set } = usePreferences()
  const [open, setOpen] = useState(false)

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
    setOpen(false)
  }

  const clearAvatar = async () => {
    await deleteStoredImage()
    set({ avatar: { type: 'none', value: '' } })
    setOpen(false)
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
    setOpen(false)
  }

  const hasAvatar = avatar.type !== 'none' && !!avatar.value
  const gridWidth = EMOJI_COLS * EMOJI_CELL + (EMOJI_COLS - 1) * EMOJI_GAP

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Popover open={open} onOpenChange={setOpen} placement='bottom-start'>
        <Popover.Trigger asChild>
          <Pressable
            accessibilityLabel={i18n.t('profilePicture')}
            accessibilityRole='button'
          >
            <Avatar avatar={avatar} name={name} size={64} />
          </Pressable>
        </Popover.Trigger>
        <Popover.Content
          borderWidth={1}
          borderColor={theme.colors.border}
          elevation='$3'
          padding={12}
          backgroundColor={theme.colors.card}
        >
          <Popover.Arrow
            borderWidth={1}
            borderColor={theme.colors.border}
            backgroundColor={theme.colors.card}
          />
          <View style={{ width: gridWidth, gap: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: EMOJI_GAP,
              }}
            >
              {EMOJI_OPTIONS.map((emoji) => {
                const selected =
                  avatar.type === 'emoji' && avatar.value === emoji
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
            <View
              style={{
                height: 1,
                backgroundColor: theme.colors.border,
              }}
            />
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
        </Popover.Content>
      </Popover>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {i18n.t('profilePicture')}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.textAlt,
            marginTop: 2,
          }}
        >
          {i18n.t('avatarPickerHelp')}
        </Text>
      </View>
    </View>
  )
}

export default AvatarPicker
