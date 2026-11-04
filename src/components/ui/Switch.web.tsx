import { Pressable, Switch as NativeSwitch } from 'react-native'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import type { SwitchProps } from '@/components/ui/Switch'

/**
 * The browser's switch is a 40×20 checkbox, and react-native-web has no
 * `hitSlop` to grow it, so it sits in a real 44×44 frame (pulled back with
 * negative margin, so the row around it doesn't move). A press on the frame
 * outside the switch toggles it; the switch's own checkbox stays the control
 * for the keyboard and screen readers.
 */
export default function Switch(props: SwitchProps) {
  const { value = false, onValueChange, disabled, accessible } = props
  const interactive = !!onValueChange && accessible !== false && !disabled
  // `focusable={false}` still leaves the frame a tab stop on the web; the
  // switch inside is the one control the keyboard reaches.
  const outOfTabOrder = { tabIndex: -1 } as object

  return (
    <Pressable
      accessible={false}
      focusable={false}
      {...outOfTabOrder}
      disabled={!interactive}
      onPress={(event) => {
        const target = event.target as unknown as { tagName?: string }
        // A press on the checkbox itself is its own change event.
        if (target.tagName === 'INPUT') return
        onValueChange?.(!value)
      }}
      style={touchTargetFrame(40, 20)}
    >
      <NativeSwitch {...props} />
    </Pressable>
  )
}
