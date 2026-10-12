import {
  Switch as NativeSwitch,
  SwitchProps as NativeSwitchProps,
} from 'react-native'

export type SwitchProps = Pick<
  NativeSwitchProps,
  | 'value'
  | 'onValueChange'
  | 'disabled'
  | 'accessibilityLabel'
  | 'accessible'
  | 'testID'
>

/** One preference control across the app, retaining the native iOS switch. */
export default function Switch(props: SwitchProps) {
  return <NativeSwitch {...props} />
}
