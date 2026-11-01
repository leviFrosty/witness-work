import {
  Switch as NativeSwitch,
  SwitchProps as NativeSwitchProps,
} from 'react-native'

export type SwitchProps = Pick<
  NativeSwitchProps,
  'value' | 'onValueChange' | 'disabled' | 'testID' | 'accessibilityHint'
> &
  (
    | {
        accessibilityLabel: string
        accessible?: true
      }
    | {
        accessible: false
        accessibilityLabel?: undefined
      }
  )

export default function Switch(props: SwitchProps) {
  return <NativeSwitch {...props} />
}
