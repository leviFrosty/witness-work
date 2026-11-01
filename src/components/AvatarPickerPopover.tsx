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
  value: ProfileAvatar

  onChange: (next: ProfileAvatar) => void

  name?: string

  size?: number

  imageFileName?: string

  background?: string

  backgroundValue?: string | null

  onBackgroundChange: (next: string | null) => void

  accessibilityLabel?: string

  onImageMeta?: (meta: AvatarMetaCapture) => void

  allowImage?: boolean
}

const CONTENT_WIDTH = 8 * 36 + 7 * 2 + 24
const EDIT_BADGE_SIZE = 24
const EDIT_BADGE_BORDER_WIDTH = 2
const EDIT_ICON_SIZE = 12
const EDIT_BADGE_OVERHANG = 3

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
