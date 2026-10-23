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
        /**
         * The setting's name. A switch has no text of its own, so without one
         * VoiceOver and TalkBack read only its value ("0", "Off").
         */
        accessibilityLabel: string
        accessible?: true
      }
    | {
        /** Display-only: the row around it is what screen readers focus. */
        accessible: false
        accessibilityLabel?: undefined
      }
  )

/** One preference control across the app, retaining the native iOS switch. */
export default function Switch(props: SwitchProps) {
  return <NativeSwitch {...props} />
}
