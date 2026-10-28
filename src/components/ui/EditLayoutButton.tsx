import { Pencil as PencilIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'

/**
 * "Edit Cards", "Edit Home": the labeled way into a screen's edit mode, after
 * the last of what it edits. Long press stays the shortcut; this one says it in
 * words, so no header needs an icon for it.
 */
export default function EditLayoutButton({
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
      onPress={onPress}
      accessibilityRole='button'
      testID={testID}
      style={{
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: MIN_TOUCH_TARGET,
        paddingHorizontal: 18,
        borderRadius: 999,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <LucideIcon
        icon={PencilIcon}
        size={theme.fontSize('sm')}
        color={theme.colors.text}
      />
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
        }}
      >
        {label}
      </Text>
    </Button>
  )
}
