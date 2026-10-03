import { Pressable, View } from 'react-native'
import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'

type Props = {
  label: string
  value?: string
  leftIcon?: AppIcon
  onPress: () => void
  lastInSection?: boolean
}

/** A tappable settings row with an optional trailing value and chevron. */
export default function MileageLinkRow({
  label,
  value,
  leftIcon,
  onPress,
  lastInSection,
}: Props) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <InputRowContainer
        label={label}
        leftIcon={leftIcon}
        lastInSection={lastInSection}
        controlWidth='auto'
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {value ? (
            <Text
              style={{ color: theme.colors.textAlt, maxWidth: 180 }}
              numberOfLines={1}
            >
              {value}
            </Text>
          ) : null}
          <LucideIcon
            icon={ChevronRightIcon}
            size={14}
            color={theme.colors.textAlt}
          />
        </View>
      </InputRowContainer>
    </Pressable>
  )
}
