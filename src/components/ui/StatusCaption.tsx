import { View } from 'react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { tracking } from '@/lib/tracking'

export default function StatusCaption({
  text,
  icon,
  color,
  numberOfLines,
}: {
  text: string
  icon?: AppIcon
  color?: string
  numberOfLines?: number
}) {
  const theme = useTheme()
  const tone = color ?? theme.colors.textAlt
  return (
    <View
      style={{
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {icon && <LucideIcon icon={icon} size={13} color={tone} />}
      <Text
        numberOfLines={numberOfLines}
        style={{
          flexShrink: 1,
          fontSize: theme.fontSize('xs') + 1,
          fontFamily: theme.fonts.semiBold,
          color: tone,
          textTransform: 'uppercase',
          letterSpacing: tracking(0.5),
        }}
      >
        {text}
      </Text>
    </View>
  )
}
