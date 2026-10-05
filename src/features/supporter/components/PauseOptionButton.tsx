import { View } from 'react-native'
import { Spinner } from 'tamagui'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'

interface Props {
  title: string
  detail: string
  onPress: () => void
  busy?: boolean
  disabled?: boolean
}

/** One pause choice in the Manage Subscription sheet. */
const PauseOptionButton = ({
  title,
  detail,
  onPress,
  busy = false,
  disabled = false,
}: Props) => {
  const theme = useTheme()

  return (
    <Button
      noTransform
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ busy, disabled }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: theme.numbers.borderRadiusSm,
        borderColor: theme.colors.border,
        borderWidth: 1,
        backgroundColor: theme.colors.backgroundLighter,
        opacity: disabled && !busy ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
          }}
        >
          {detail}
        </Text>
      </View>
      {busy && <Spinner color={theme.colors.textAlt} />}
    </Button>
  )
}

export default PauseOptionButton
