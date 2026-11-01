import { View } from 'react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export default function TimelinePill({
  icon,
  label,
}: {
  icon: AppIcon
  label: string
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
      }}
    >
      <LucideIcon icon={icon} size={10} color={theme.colors.textAlt} />
      <Text
        style={{
          fontSize: theme.fontSize('xs') + 1,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {label}
      </Text>
    </View>
  )
}
