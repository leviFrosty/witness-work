import { Check as CheckIcon } from 'lucide-react-native'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export default function SortFilterOption({
  label,
  description,
  selected,
  onPress,
  testID,
}: {
  label: string
  description?: string
  selected: boolean
  onPress: () => void
  testID?: string
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      noTransform
      accessibilityState={{ selected }}
      testID={testID}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: theme.numbers.borderRadiusSm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: selected
          ? theme.colors.accentTranslucent
          : theme.colors.backgroundLighter,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
      }}
    >
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: selected ? theme.fonts.semiBold : theme.fonts.regular,
            color: selected ? theme.colors.accent : theme.colors.text,
          }}
        >
          {label}
        </Text>
        {description && (
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {description}
          </Text>
        )}
      </View>
      {selected && (
        <LucideIcon
          icon={CheckIcon}
          size={theme.fontSize('md')}
          style={{ color: theme.colors.accent }}
        />
      )}
    </Button>
  )
}
