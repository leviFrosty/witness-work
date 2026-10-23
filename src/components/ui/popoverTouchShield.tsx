import { type ReactNode, type RefObject, useEffect } from 'react'
import { type GestureResponderEvent, View } from 'react-native'

// Native popovers that are open or still closing, each with the view holding
// its React Native content (null for content that's all native).
const openPopovers = new Map<string, RefObject<View | null> | null>()

/**
 * Registers a native popover as open, so a tap outside it only dismisses it.
 * SwiftUI lets that tap through to the control behind the popover and reports
 * the dismissal only after the press has already run.
 */
export function usePopoverTouchShield(
  id: string,
  active: boolean,
  contentRef?: RefObject<View | null>
) {
  useEffect(() => {
    if (!active) return
    openPopovers.set(id, contentRef ?? null)
    return () => {
      openPopovers.delete(id)
    }
  }, [id, active, contentRef])
}

function startsOutsidePopovers(event: GestureResponderEvent) {
  if (openPopovers.size === 0) return false
  const target = event.target as unknown as View
  for (const contentRef of openPopovers.values()) {
    if (contentRef?.current?.contains(target)) return false
  }
  return true
}

/**
 * Claims every touch that starts outside an open native popover, so nothing
 * behind it presses. The popover dismisses itself on that same tap.
 */
export function PopoverTouchShield({ children }: { children: ReactNode }) {
  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={startsOutsidePopovers}
      onMoveShouldSetResponderCapture={startsOutsidePopovers}
      onResponderTerminationRequest={() => false}
    >
      {children}
    </View>
  )
}
