import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'

interface Props {
  icon: AppIcon
  label: string
  value: string
  tint: string
  tintBg: string
  iconFill?: string
}

const SinceBadge = ({ icon, label, value, tint, tintBg, iconFill }: Props) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tintBg,
        }}
      >
        <LucideIcon icon={icon} size={15} color={tint} fill={iconFill} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 11,
            color: theme.colors.textAlt,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: theme.colors.text,
            fontFamily: theme.fonts.semiBold,
            marginTop: 2,
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

export default SinceBadge
