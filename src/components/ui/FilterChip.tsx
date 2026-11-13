import { View } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export default function FilterChip({
  label,
  count,
  color,
  icon,
  active,
  onPress,
  testID,
}: {
  label: string

  count?: number

  color?: string

  icon?: AppIcon
  active: boolean
  onPress: () => void
  testID?: string
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      noTransform
      accessibilityRole='button'
      accessibilityState={{ selected: active }}
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,

        minHeight: 32,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
        backgroundColor: active
          ? theme.colors.accentTranslucent
          : theme.colors.backgroundLighter,

        opacity: count === 0 && !active ? 0.55 : 1,
      }}
    >
      {color && (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
      )}
      {icon && (
        <LucideIcon
          icon={icon}
          size={theme.fontSize('sm')}
          style={{ color: active ? theme.colors.accent : theme.colors.text }}
        />
      )}
      <Text
        numberOfLines={1}
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: active ? theme.fonts.semiBold : theme.fonts.medium,
          color: active ? theme.colors.accent : theme.colors.text,
        }}
      >
        {label}
      </Text>
      {count !== undefined && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: active ? theme.colors.accent : theme.colors.textAlt,
          }}
        >
          {count}
        </Text>
      )}
    </Button>
  )
}
