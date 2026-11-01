import { type ReactNode, type RefObject, useEffect } from 'react'
import { type GestureResponderEvent, View } from 'react-native'

const openPopovers = new Map<string, RefObject<View | null> | null>()

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
