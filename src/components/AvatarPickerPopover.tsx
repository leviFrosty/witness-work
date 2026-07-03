import { Pressable, View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPencil } from '@fortawesome/free-solid-svg-icons/faPencil'
import useTheme from '@/contexts/theme'
import { ProfileAvatar } from '@/types/avatar'
import Avatar from '@/components/ui/Avatar'
import AvatarPickerContent, {
  AvatarMetaCapture,
} from '@/components/AvatarPickerContent'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import i18n from '@/lib/locales'

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
  /** Currently-selected background override (null = match accent). */
  backgroundValue?: string | null
  /** Called when the user picks a different swatch. */
  onBackgroundChange: (next: string | null) => void
  /** Accessibility label for the tappable anchor. Defaults to "profilePicture". */
  accessibilityLabel?: string
  /**
   * Forwarded to the picker so callers (specifically `ContactFormScreen`) can
   * persist resolution / file size / capturedAt metadata on the contact.
   * Optional — the user's profile avatar doesn't track meta.
   */
  onImageMeta?: (meta: AvatarMetaCapture) => void
}

// Width of the picker content (8 cols × 36 cell + 7 × 2 gap) plus padding.
const CONTENT_WIDTH = 8 * 36 + 7 * 2 + 24

/**
 * Tappable avatar that opens an inline picker above the avatar. Delegates the
 * popover shell (RN Modal, anchor measurement, safe Reanimated mount lifecycle)
 * to `AnchoredPopover` — see that component for the why behind the lifecycle.
 */
const AvatarPickerPopover = ({
  value,
  onChange,
  name,
  size = 44,
  imageFileName,
  background,
  backgroundValue = null,
  onBackgroundChange,
  accessibilityLabel,
  onImageMeta,
}: Props) => {
  const theme = useTheme()

  return (
    <AnchoredPopover
      contentWidth={CONTENT_WIDTH}
      renderTrigger={({ onPress, anchorRef }) => (
        <View ref={anchorRef} collapsable={false}>
          <Pressable
            accessibilityLabel={accessibilityLabel ?? i18n.t('profilePicture')}
            accessibilityRole='button'
            onPress={onPress}
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
      )}
    >
      {({ close }) => (
        <AvatarPickerContent
          value={value}
          onChange={(next) => {
            onChange(next)
            close()
          }}
          imageFileName={imageFileName}
          backgroundValue={backgroundValue}
          onBackgroundChange={onBackgroundChange}
          onImageMeta={onImageMeta}
        />
      )}
    </AnchoredPopover>
  )
}

export default AvatarPickerPopover
