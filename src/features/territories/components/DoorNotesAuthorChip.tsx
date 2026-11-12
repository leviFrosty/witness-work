import { Check as CheckIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export default function DoorNotesAuthorChip({
  label,
  picked,
  onPress,
  testID,
}: {
  label: string
  picked: boolean
  onPress: () => void
  testID: string
}) {
  const theme = useTheme()
  return (
    <Button
      noTransform
      onPress={onPress}
      accessibilityRole='radio'
      accessibilityState={{ checked: picked }}
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: picked ? theme.colors.accent : theme.colors.border,
        backgroundColor: picked
          ? theme.colors.accentTranslucent
          : theme.colors.background,
      }}
    >
      {picked && (
        <LucideIcon icon={CheckIcon} size={16} color={theme.colors.accent} />
      )}
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontFamily: picked ? theme.fonts.semiBold : theme.fonts.medium,
          color: picked ? theme.colors.accent : theme.colors.text,
        }}
      >
        {label}
      </Text>
    </Button>
  )
}
