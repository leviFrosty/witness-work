import { Platform, Switch as NativeSwitch, SwitchProps } from 'react-native'
import { Switch as TamaguiSwitch } from 'tamagui'
import useTheme from '@/contexts/theme'

const TRACK_WIDTH = 52
const TRACK_HEIGHT = 32
const TRACK_PADDING = 3
const THUMB_SIZE = TRACK_HEIGHT - TRACK_PADDING * 2

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
      width={TRACK_WIDTH}
      height={TRACK_HEIGHT}
      minHeight={TRACK_HEIGHT}
      flexShrink={0}
      padding={TRACK_PADDING}
      borderWidth={0}
      backgroundColor={theme.colors.border}
      activeStyle={{ backgroundColor: theme.colors.accent }}
      opacity={disabled ? 0.5 : 1}
      hitSlop={8}
    >
      <TamaguiSwitch.Thumb
        transition='quick'
        width={THUMB_SIZE}
        height={THUMB_SIZE}
        backgroundColor='white'
      />
    </TamaguiSwitch>
  )
}
