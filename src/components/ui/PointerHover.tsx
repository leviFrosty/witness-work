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
  /** A single native view (or component that renders one) to hover. */
  children: ReactElement
  /**
   * IPadOS system effect. `highlight` suits small controls, `lift` small opaque
   * ones. Large surfaces (rows, cards) keep `none` and tint themselves from
   * `onHoverChange`: the system effects scale, which overlaps neighbours.
   */
  effect?: PointerEffect
  onHoverChange?: (hovered: boolean) => void
  /** Pauses hover without remounting the children. */
  enabled?: boolean
}

/**
 * Pointer and Pencil hover via `UIHoverGestureRecognizer` (Android mouse hover
 * too). Hover never takes touches, so it composes with any press.
 */
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

/**
 * Hover feedback for large surfaces (rows, cards): a faint overlay, without the
 * scale that would push into neighbours. Render it last inside the hovered
 * view.
 */
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
