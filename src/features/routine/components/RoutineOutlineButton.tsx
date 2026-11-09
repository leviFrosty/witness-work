import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'

export default function RoutineOutlineButton({
  label,
  onPress,
  testID,
}: {
  label: string
  onPress: () => void
  testID?: string
}) {
  const theme = useTheme()
  return (
    <Button
      accessibilityRole='button'
      onPress={onPress}
      testID={testID}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.numbers.borderRadiusMd,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text style={{ fontFamily: theme.fonts.semiBold }}>{label}</Text>
    </Button>
  )
}
