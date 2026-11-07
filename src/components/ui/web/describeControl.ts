import { FOCUSABLE } from '@/components/ui/web/focusTrap'

export const tooltipDomId = (id: number) => `ww-tooltip-${id}`

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
