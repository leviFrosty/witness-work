import { View } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'

export const CHIP_HEIGHT = 34

const TARGET_OUTSET = (CHIP_HEIGHT - MIN_TOUCH_TARGET) / 2

export function ActionChip({
  icon,
  label,
  onPress,
  testID,
  surface,
}: {
  icon: AppIcon
  label: string
  onPress: () => void
  testID?: string

  surface?: string
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      testID={testID}
      hitSlop={0}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        marginVertical: TARGET_OUTSET,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          minHeight: CHIP_HEIGHT,
          paddingHorizontal: 12,
          borderRadius: CHIP_HEIGHT / 2,
          backgroundColor: surface ?? theme.colors.backgroundLighter,
        }}
      >
        <LucideIcon icon={icon} size={15} color={theme.colors.text} />
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {label}
        </Text>
      </View>
    </Button>
  )
}

export function ActionChipIcon({
  icon,
  accessibilityLabel,
  onPress,
  testID,
  surface,
}: {
  icon: AppIcon
  accessibilityLabel: string
  onPress: () => void
  testID?: string
  surface?: string
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      hitSlop={0}
      style={{
        width: MIN_TOUCH_TARGET,
        minHeight: MIN_TOUCH_TARGET,
        marginVertical: TARGET_OUTSET,
        marginEnd: TARGET_OUTSET,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: CHIP_HEIGHT,
          height: CHIP_HEIGHT,
          borderRadius: CHIP_HEIGHT / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: surface ?? theme.colors.backgroundLighter,
        }}
      >
        <LucideIcon icon={icon} size={15} color={theme.colors.text} />
      </View>
    </Button>
  )
}
