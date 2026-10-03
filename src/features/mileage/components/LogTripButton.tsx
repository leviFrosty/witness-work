import type { StyleProp, ViewStyle } from 'react-native'
import { Plus as PlusIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'

type Props = {
  onPress: () => void
  label?: string
  icon?: AppIcon
  style?: StyleProp<ViewStyle>
}

/** The accent "Log Trip" call to action, matching Home's Add Time button. */
export default function LogTripButton({
  onPress,
  label = i18n.t('mileage.logTrip'),
  icon = PlusIcon,
  style,
}: Props) {
  const theme = useTheme()
  return (
    <Button
      variant='glass'
      glassTint={theme.colors.accent}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        {
          minHeight: 48,
          paddingVertical: 13,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: theme.colors.accent,
          borderRadius: theme.numbers.borderRadiusMd,
        },
        style,
      ]}
    >
      <LucideIcon icon={icon} size={18} color={theme.colors.textInverse} />
      <Text
        style={{
          color: theme.colors.textInverse,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
        }}
      >
        {label}
      </Text>
    </Button>
  )
}
