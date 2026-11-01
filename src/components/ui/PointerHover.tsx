import type { ReactElement } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import {
  Gesture,
  GestureDetector,
  HoverEffect,
  PointerType,
} from 'react-native-gesture-handler'
import useTheme from '@/contexts/theme'
import {
  notePointerHover,
  supportsPointerEffects,
  supportsPointerHover,
} from '@/lib/pointerHover'

export type PointerEffect = 'highlight' | 'lift' | 'none'

const EFFECTS = {
  highlight: HoverEffect.HIGHLIGHT,
  lift: HoverEffect.LIFT,
  none: HoverEffect.NONE,
} as const

type Props = {
  children: ReactElement

  effect?: PointerEffect
  onHoverChange?: (hovered: boolean) => void

  enabled?: boolean
}

export default function PointerHover({
  children,
  effect = 'none',
  onHoverChange,
  enabled = true,
}: Props) {
  const hasEffect = supportsPointerEffects && effect !== 'none'
  if (!supportsPointerHover || (!hasEffect && !onHoverChange)) return children

  const hover = Gesture.Hover()
    .runOnJS(true)
    .enabled(enabled)
    .effect(EFFECTS[effect])
    .onBegin((event) => {
      notePointerHover(
        event.pointerType === PointerType.STYLUS ? 'stylus' : 'pointer'
      )
      onHoverChange?.(true)
    })
    .onFinalize(() => onHoverChange?.(false))

  return <GestureDetector gesture={hover}>{children}</GestureDetector>
}

export function HoverTint({
  visible,
  borderRadius,
  borderCurve,
}: {
  visible: boolean
  borderRadius?: ViewStyle['borderRadius']
  borderCurve?: ViewStyle['borderCurve']
}) {
  const theme = useTheme()
  if (!visible) return null
  return (
    <View
      pointerEvents='none'
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius,
          borderCurve,
          backgroundColor: theme.colors.text,
          opacity: 0.06,
        },
      ]}
    />
  )
}
