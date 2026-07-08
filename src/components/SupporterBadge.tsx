import { Heart as HeartIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View, ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'

interface Props {
  /** Hides the "Supporter" label — shows only the heart icon chip. */
  iconOnly?: boolean
  size?: 'sm' | 'md' | 'lg'
  style?: ViewStyle
}

const sizes = {
  sm: { icon: 9, font: 10, paddingV: 3, paddingH: 7 },
  md: { icon: 11, font: 12, paddingV: 4, paddingH: 9 },
  lg: { icon: 13, font: 14, paddingV: 6, paddingH: 12 },
} as const

const SupporterBadge = ({ iconOnly, size = 'sm', style }: Props) => {
  const theme = useTheme()
  const { icon: iconSize, font: fontSize, paddingV, paddingH } = sizes[size]

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingVertical: paddingV,
          paddingHorizontal: iconOnly ? paddingV : paddingH,
          borderRadius: 999,
          backgroundColor: theme.colors.supporterTranslucent,
        },
        style,
      ]}
    >
      <LucideIcon
        icon={HeartIcon}
        size={iconSize}
        color={theme.colors.supporter}
      />
      {!iconOnly && (
        <Text
          style={{
            fontSize,
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.supporter,
            letterSpacing: 0.3,
          }}
        >
          {i18n.t('supporter')}
        </Text>
      )}
    </View>
  )
}

export default SupporterBadge
