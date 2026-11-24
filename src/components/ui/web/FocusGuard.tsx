import {
  createElement,
  type CSSProperties,
  type FocusEvent,
  type RefObject,
} from 'react'
import {
  FOCUS_GUARD_ATTR,
  redirectFromGuard,
} from '@/components/ui/web/focusTrap'

const guardStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
  opacity: 0,
  outline: 'none',
  pointerEvents: 'none',
}

export default function FocusGuard({
  edge,
  active = true,
  containerRef,
  fallbackRef,
}: {
  edge: 'start' | 'end'
  active?: boolean
  containerRef: RefObject<HTMLElement | null>
  fallbackRef?: RefObject<HTMLElement | null>
}) {
  if (!active) return null
  return createElement('span', {
    [FOCUS_GUARD_ATTR]: edge,
    tabIndex: 0,
    'aria-hidden': true,
    style: guardStyle,
    onFocus: (event: FocusEvent<HTMLSpanElement>) => {
      redirectFromGuard(
        edge,
        containerRef.current,
        event.relatedTarget,
        fallbackRef?.current ?? containerRef.current
      )
    },
  })
}
