import { Pressable, Switch as NativeSwitch } from 'react-native'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import type { SwitchProps } from '@/components/ui/Switch'

export default function Switch(props: SwitchProps) {
  const { value = false, onValueChange, disabled, accessible } = props
  const interactive = !!onValueChange && accessible !== false && !disabled

  const outOfTabOrder = { tabIndex: -1 } as object

  return (
    <Pressable
      accessible={false}
      focusable={false}
      {...outOfTabOrder}
      disabled={!interactive}
      onPress={(event) => {
        const target = event.target as unknown as { tagName?: string }

        if (target.tagName === 'INPUT') return
        onValueChange?.(!value)
      }}
      style={touchTargetFrame(40, 20)}
    >
      <NativeSwitch {...props} />
    </Pressable>
  )
}
