import { type ReactElement } from 'react'
import { createElement } from 'react'

export { default as HoverTint } from '@/components/ui/HoverTint'

export type PointerEffect = 'highlight' | 'lift' | 'none'

type Props = {
  /** A single view (or component that renders one) to hover. */
  children: ReactElement
  /** The system effects are UIKit's; on the web, hover feeds `onHoverChange`. */
  effect?: PointerEffect
  onHoverChange?: (hovered: boolean) => void
  /** Keyboard focus (`:focus-visible`) of the children, not a click's. */
  onFocusVisibleChange?: (focused: boolean) => void
  /** Pauses hover without remounting the children. */
  enabled?: boolean
}

/**
 * The iPad's highlight and lift for a custom pressable, drawn as a shadow that
 * follows the control's own corners. Only where a pointer hovers (so a tap
 * leaves nothing behind) and never scaling into a neighbour.
 */
const css = `
@media (hover:hover) and (pointer:fine){
div[data-ww-pointer=highlight]>:hover{box-shadow:0 0 0 6px rgba(128,128,128,.2)}
div[data-ww-pointer=lift]>:hover{box-shadow:0 2px 6px rgba(0,0,0,.22)}
}
`

/**
 * Mouse and pen hover on the web. Touch doesn't hover, so a tap never leaves a
 * control looking hovered. The wrapper has no box of its own: the children lay
 * out as if it weren't there.
 */
export default function PointerHover({
  children,
  effect,
  onHoverChange,
  onFocusVisibleChange,
  enabled = true,
}: Props) {
  const drawn = effect === 'highlight' || effect === 'lift' ? effect : undefined
  if (!(onHoverChange || onFocusVisibleChange || drawn) || !enabled)
    return children
  const crossing =
    (hovered: boolean) =>
    (event: {
      pointerType: string
      currentTarget: Node
      relatedTarget: EventTarget | null
    }) => {
      if (event.pointerType === 'touch') return
      // Moving between the children isn't entering or leaving.
      if (event.currentTarget.contains(event.relatedTarget as Node | null))
        return
      onHoverChange?.(hovered)
    }
  const focusing = (focused: boolean) => (event: { target: EventTarget }) => {
    const target = event.target as Element
    if (!focused || target.matches?.(':focus-visible'))
      onFocusVisibleChange?.(focused)
  }
  return createElement(
    'div',
    {
      'data-ww-pointer': drawn,
      style: { display: 'contents' },
      onPointerOver: crossing(true),
      onPointerOut: crossing(false),
      onFocus: onFocusVisibleChange ? focusing(true) : undefined,
      onBlur: onFocusVisibleChange ? focusing(false) : undefined,
    },
    drawn && (
      <style href='ww-pointer-hover' precedence='ww'>
        {css}
      </style>
    ),
    children
  )
}
