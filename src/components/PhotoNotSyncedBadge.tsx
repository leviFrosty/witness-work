import { View } from 'react-native'
import { CloudOff as CloudOffIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  PHOTO_SYNC_PROBLEM_LABEL,
  usePhotoSyncProblem,
} from '@/lib/syncTransport/photoSyncStatus'

export default function PhotoNotSyncedBadge({
  filename,
  variant,
  color,
}: {
  filename: string | null
  variant: 'overlay' | 'inline'
  color?: string
}) {
  const theme = useTheme()
  const problem = usePhotoSyncProblem(filename)
  if (!problem) return null
  const label = i18n.t(PHOTO_SYNC_PROBLEM_LABEL[problem])

  if (variant === 'inline') {
    const tint = color ?? theme.colors.warnText
    return (
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        accessible
        accessibilityLabel={label}
      >
        <LucideIcon icon={CloudOffIcon} size={13} color={tint} />
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: tint,
            flexShrink: 1,
          }}
        >
          {label}
        </Text>
      </View>
    )
  }

  return (
    <View
      pointerEvents='none'
      accessible
      accessibilityLabel={label}
      style={{
        position: 'absolute',
        start: 8,
        bottom: 8,
        maxWidth: '90%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.warnAlt,
      }}
    >
      <LucideIcon icon={CloudOffIcon} size={13} color={theme.colors.warnText} />
      <Text
        numberOfLines={1}
        style={{
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.warnText,
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </View>
  )
}
