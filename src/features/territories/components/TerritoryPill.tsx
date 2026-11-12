import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export default function TerritoryPill({
  icon,
  iconColor,
  label,
  onPress,
  testID,
  fill = false,
  surface = 'card',
  dense = false,
  accessibilityLabel,
  accessibilityHint,
}: {
  icon?: AppIcon
  iconColor?: string
  label: string
  onPress: () => void
  testID?: string
  fill?: boolean
  surface?: 'card' | 'background'
  dense?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={{
        flexGrow: fill ? 1 : 0,
        flexShrink: 1,
        alignSelf: fill ? undefined : 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: dense ? 5 : 6,
        minHeight: 44,
        paddingHorizontal: dense ? 10 : 14,
        borderRadius: 22,
        backgroundColor:
          surface === 'card' ? theme.colors.card : theme.colors.background,
      }}
    >
      {icon && (
        <LucideIcon
          icon={icon}
          size={dense ? 16 : 18}
          color={iconColor ?? theme.colors.accent}
        />
      )}
      <Text
        numberOfLines={1}
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </Button>
  )
}
