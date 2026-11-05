import { View } from 'react-native'
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { FORM_ROW_MIN_HEIGHT } from '@/components/ui/inputs/FormRow'
import useTheme from '@/contexts/theme'
import { alignText } from '@/lib/direction'

const DetailRow = (props: {
  label: string
  value: string
  onPress: () => void

  divider?: boolean
  paddingX: number
  testID?: string
}) => {
  const theme = useTheme()
  return (
    <Button
      noTransform
      onPress={props.onPress}
      accessibilityRole='button'
      accessibilityLabel={props.label}
      accessibilityValue={{ text: props.value }}
      testID={props.testID}
      style={{
        borderTopWidth: props.divider ? 1 : 0,
        borderTopColor: theme.colors.border,
      }}
    >
      <View
        style={{
          minHeight: FORM_ROW_MIN_HEIGHT,
          paddingHorizontal: props.paddingX,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Text
          style={{
            fontFamily: theme.fonts.medium,
            fontSize: theme.fontSize('md'),
            flexShrink: 0,
          }}
        >
          {props.label}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            textAlign: alignText('end'),
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('md'),
          }}
        >
          {props.value}
        </Text>
        <LucideIcon
          icon={ChevronForwardIcon}
          size={18}
          color={theme.colors.textAlt}
        />
      </View>
    </Button>
  )
}

export default DetailRow
