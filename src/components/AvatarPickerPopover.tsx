import { Pencil as PencilIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Pressable, View } from 'react-native'
import useTheme from '@/contexts/theme'
import { ProfileAvatar } from '@/types/avatar'
import Avatar from '@/components/ui/Avatar'
import AvatarPickerContent, {
  AvatarMetaCapture,
} from '@/components/AvatarPickerContent'
import Popover from '@/components/ui/Popover'
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
  /** Forwarded to the picker — see `AvatarPickerContent`'s `allowImage`. */
  allowImage?: boolean
}

// Width of the picker content (8 cols × 36 cell + 7 × 2 gap) plus padding.
const CONTENT_WIDTH = 8 * 36 + 7 * 2 + 24
const EDIT_BADGE_SIZE = 24
const EDIT_BADGE_BORDER_WIDTH = 2
const EDIT_ICON_SIZE = 12
const EDIT_BADGE_OVERHANG = 3

/** Tappable avatar that opens the avatar picker in a popover beside it. */
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
  allowImage = true,
}: Props) => {
  const theme = useTheme()

  return (
    <Popover
      contentWidth={CONTENT_WIDTH}
      // Room for the edit badge, which hangs off the avatar's corner.
      style={{ margin: -EDIT_BADGE_OVERHANG }}
      renderTrigger={({ onPress }) => (
        <Pressable
          accessibilityLabel={accessibilityLabel ?? i18n.t('profilePicture')}
          accessibilityRole='button'
          onPress={onPress}
          hitSlop={8}
          style={{ padding: EDIT_BADGE_OVERHANG }}
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
                right: EDIT_BADGE_OVERHANG - 3,
                bottom: EDIT_BADGE_OVERHANG - 3,
                width: EDIT_BADGE_SIZE,
                height: EDIT_BADGE_SIZE,
                borderRadius: EDIT_BADGE_SIZE / 2,
                backgroundColor: theme.colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: EDIT_BADGE_BORDER_WIDTH,
                borderColor: theme.colors.card,
              }}
            >
              <LucideIcon
                icon={PencilIcon}
                size={EDIT_ICON_SIZE}
                color={theme.colors.textInverse}
              />
            </View>
          </View>
        </Pressable>
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
          allowImage={allowImage}
          backgroundValue={backgroundValue}
          onBackgroundChange={onBackgroundChange}
          onImageMeta={onImageMeta}
        />
      )}
    </Popover>
  )
}

export default AvatarPickerPopover
