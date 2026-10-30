import type { ReactElement } from 'react'
import {
  Gesture,
  GestureDetector,
  HoverEffect,
  PointerType,
} from 'react-native-gesture-handler'
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
  /** The web's keyboard focus (`:focus-visible`); nothing elsewhere. */
  onFocusVisibleChange?: (focused: boolean) => void
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

export { default as HoverTint } from '@/components/ui/HoverTint'
