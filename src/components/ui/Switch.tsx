import { Platform, Switch as NativeSwitch, SwitchProps } from 'react-native'
import { Switch as TamaguiSwitch } from 'tamagui'
import useTheme from '@/contexts/theme'

type Props = Pick<
  SwitchProps,
  | 'value'
  | 'onValueChange'
  | 'disabled'
  | 'accessibilityLabel'
  | 'accessible'
  | 'testID'
>

/** One preference control across the app, retaining the native iOS switch. */
export default function Switch(props: Props) {
  const theme = useTheme()
  if (Platform.OS === 'ios') return <NativeSwitch {...props} />

  const {
    value = false,
    onValueChange,
    disabled,
    ...accessibilityProps
  } = props
  return (
    <TamaguiSwitch
      {...accessibilityProps}
      checked={value}
      onCheckedChange={onValueChange ?? undefined}
      disabled={disabled}
      accessibilityRole='switch'
      accessibilityState={{ checked: value, disabled: !!disabled }}
      size='$3'
      flexShrink={0}
      padding={2}
      backgroundColor={theme.colors.border}
      activeStyle={{ backgroundColor: theme.colors.accent }}
      opacity={disabled ? 0.5 : 1}
      hitSlop={8}
    >
      <TamaguiSwitch.Thumb backgroundColor='white' />
    </TamaguiSwitch>
  )
}
