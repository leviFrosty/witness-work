import type { ComponentType } from 'react'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

type Props = {
  label: string
  onPress: () => void
  /** `primary` filled, `secondary` outlined, `text` a bare label. */
  kind?: 'primary' | 'secondary' | 'text'
  /** Paints the label as destructive (That Wasn't Me). */
  destructive?: boolean
  icon?: ComponentType<{ size?: number; color?: string }>
  disabled?: boolean
  loading?: boolean
  testID?: string
}

/** A full-width sign-in action, at least 48 pt tall. */
export default function SignInButton({
  label,
  onPress,
  kind = 'secondary',
  destructive,
  icon: Icon,
  disabled,
  loading,
  testID,
}: Props) {
  const theme = useTheme()
  const color =
    kind === 'primary'
      ? theme.colors.textInverse
      : destructive
        ? theme.colors.error
        : kind === 'text'
          ? theme.colors.accent
          : theme.colors.text
  return (
    <Button
      accessibilityRole='button'
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      loadingColor={color}
      variant={kind === 'secondary' ? 'outline' : 'solid'}
      testID={testID}
      style={{
        minHeight: 48,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: theme.numbers.borderRadiusSm,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        opacity: disabled ? 0.5 : 1,
        backgroundColor:
          kind === 'primary'
            ? theme.colors.accent
            : kind === 'text'
              ? 'transparent'
              : undefined,
        ...(kind === 'secondary' && { borderColor: theme.colors.border }),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {Icon && <Icon size={20} color={color} />}
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color,
          }}
        >
          {label}
        </Text>
      </View>
    </Button>
  )
}
