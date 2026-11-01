import { ActivityIndicator, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

type Action = { label: string; onPress: () => void; testID?: string }

export default function HandoffStatus({
  icon,
  tone = 'neutral',
  loading,
  title,
  body,
  detail,
  primary,
  secondary,
  testID,
}: {
  icon?: AppIcon
  tone?: 'success' | 'error' | 'neutral'
  loading?: boolean
  title?: string
  body?: string

  detail?: string
  primary?: Action
  secondary?: Action
  testID?: string
}) {
  const theme = useTheme()
  const color =
    tone === 'success'
      ? theme.colors.accent
      : tone === 'error'
        ? theme.colors.error
        : theme.colors.textAlt
  return (
    <View
      style={{ alignItems: 'center', gap: 14, paddingHorizontal: 10 }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size='large' />
      ) : icon ? (
        <LucideIcon icon={icon} size={48} color={color} />
      ) : null}
      {title && (
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
      )}
      {body && (
        <Text
          accessibilityLiveRegion='polite'
          style={{ textAlign: 'center', maxWidth: 340 }}
        >
          {body}
        </Text>
      )}
      {detail && (
        <Text
          style={{
            textAlign: 'center',
            maxWidth: 340,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {detail}
        </Text>
      )}
      {primary && (
        <View style={{ alignSelf: 'stretch', marginTop: 6 }}>
          <ActionButton onPress={primary.onPress} testID={primary.testID}>
            {primary.label}
          </ActionButton>
        </View>
      )}
      {secondary && <HandoffTextButton {...secondary} />}
    </View>
  )
}

export function HandoffTextButton({
  label,
  onPress,
  testID,
  tone = 'accent',
}: Action & { tone?: 'accent' | 'error' }) {
  const theme = useTheme()
  return (
    <Button
      accessibilityRole='button'
      onPress={onPress}
      testID={testID}
      style={{ paddingVertical: 10, paddingHorizontal: 16 }}
    >
      <Text
        style={{
          color: tone === 'error' ? theme.colors.error : theme.colors.accent,
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {label}
      </Text>
    </Button>
  )
}
