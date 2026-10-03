import { View } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

type Props = {
  icon: AppIcon
  label: string
  onPress: () => void
  /** Defaults to `label`; extend it when the badge carries meaning. */
  accessibilityLabel?: string
  /** A dot for something waiting, e.g. requests to confirm. */
  badge?: boolean
}

/** A labeled root-header action, for places and tasks an icon can't name. */
export default function HeaderPillButton({
  icon,
  label,
  onPress,
  accessibilityLabel,
  badge,
}: Props) {
  const theme = useTheme()

  return (
    <Button
      noTransform
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={8}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentTranslucent,
      }}
    >
      <LucideIcon
        icon={icon}
        size={theme.fontSize('md')}
        color={theme.colors.accent}
      />
      <Text
        numberOfLines={1}
        style={{
          color: theme.colors.accent,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {label}
      </Text>
      {badge && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: theme.colors.error,
          }}
        />
      )}
    </Button>
  )
}
