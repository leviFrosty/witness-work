import { FOCUSABLE } from '@/components/ui/web/focusTrap'

/** The DOM id of a tooltip's bubble, for `aria-describedby`. */
export const tooltipDomId = (id: number) => `ww-tooltip-${id}`

/**
 * Makes the control inside `anchor` (a DOM node, once mounted: React Native Web
 * hands a view's ref its node) described by the element with `domId`, which is
 * how a screen reader hears a tooltip. Returns what undoes it.
 */
export function describeControl(anchor: unknown, domId: string) {
  const node = anchor as HTMLElement | null
  const control = node?.matches?.(FOCUSABLE)
    ? node
    : node?.querySelector<HTMLElement>(FOCUSABLE)
  if (!control) return () => undefined
  const before = control.getAttribute('aria-describedby')
  control.setAttribute(
    'aria-describedby',
    before ? `${before} ${domId}` : domId
  )
  return () => {
    if (before) control.setAttribute('aria-describedby', before)
    else control.removeAttribute('aria-describedby')
  }
}
