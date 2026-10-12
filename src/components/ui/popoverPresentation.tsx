import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { Keyboard, ScrollView, useWindowDimensions, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { VisibilityViewportContext } from '@/contexts/visibilityViewport'
import { PopoverContext } from '@/components/ui/popoverContext'
import type {
  PopoverControls,
  PopoverProps,
} from '@/components/ui/Popover.types'

// A tap that lands while the keyboard is up waits for it to hide, so the
// popover anchors to where the trigger settles. Never leave it stranded.
const KEYBOARD_SETTLE_FALLBACK_MS = 600

/**
 * The state every native popover shares: content that mounts on open and
 * unmounts once dismissed, actions deferred until then, closing when the screen
 * loses focus, holding takeovers off, and a height cap that keeps the content
 * on screen on whichever side of the trigger has more room.
 */
export function usePopoverPresentation({
  edge,
  dismissFallbackMs,
}: {
  /** Space the platform keeps between the content and a screen edge. */
  edge: number
  /** Unmount this long after closing if the platform never reports it. */
  dismissFallbackMs: number
}) {
  const navigation = useNavigation()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const triggerRef = useRef<View>(null)
  const [mounted, setMounted] = useState(false)
  const [open, setOpenState] = useState(false)
  const [maxHeight, setMaxHeight] = useState<number>()
  const openRef = useRef(false)
  const afterDismiss = useRef<(() => void) | null>(null)
  const request = useRef(0)
  // Content mounted and waiting for its layout before it presents.
  const pendingOpen = useRef(false)
  const holdId = useId()
  // Nothing takes over the screen while a popover is open or closing.
  useTakeoverHold(`popover:${holdId}`, mounted)

  const setOpen = (next: boolean) => {
    openRef.current = next
    setOpenState(next)
  }

  const measureAndMount = (id: number) => {
    const mount = (cap?: number) => {
      if (id !== request.current) return
      setMaxHeight(cap)
      afterDismiss.current = null
      pendingOpen.current = true
      setMounted(true)
    }
    const trigger = triggerRef.current
    if (!trigger) return mount()
    trigger.measureInWindow((_x, y, _width, triggerHeight) => {
      const above = y - insets.top
      const below = height - insets.bottom - y - triggerHeight
      mount(Math.max(120, Math.max(above, below) - edge))
    })
  }

  const show = () => {
    const id = ++request.current
    if (!Keyboard.isVisible()) {
      measureAndMount(id)
      return
    }
    const fallback = setTimeout(() => {
      subscription.remove()
      measureAndMount(id)
    }, KEYBOARD_SETTLE_FALLBACK_MS)
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      clearTimeout(fallback)
      subscription.remove()
      measureAndMount(id)
    })
    Keyboard.dismiss()
  }

  // Presents once the content has laid out, so the popover opens at its final
  // size instead of growing into it.
  const contentLaidOut = () => {
    if (!pendingOpen.current) return
    pendingOpen.current = false
    setOpen(true)
  }

  const close = () => {
    request.current += 1
    pendingOpen.current = false
    setOpen(false)
  }

  const closeThen = (action: () => void) => {
    afterDismiss.current = action
    close()
  }

  // Once the platform has dismissed it: unmount the content and run what was
  // waiting on that, unless the trigger was tapped again meanwhile.
  const dismissed = () => {
    if (openRef.current) return
    if (pendingOpen.current) {
      pendingOpen.current = false
      setOpen(true)
      return
    }
    setMounted(false)
    const then = afterDismiss.current
    afterDismiss.current = null
    then?.()
  }

  // Presents content that never reported a layout, and settles a dismissal the
  // platform never reported.
  useEffect(() => {
    if (!mounted || open) return
    const timer = setTimeout(
      () => {
        if (openRef.current) return
        if (pendingOpen.current) {
          pendingOpen.current = false
          setOpen(true)
          return
        }
        setMounted(false)
        const then = afterDismiss.current
        afterDismiss.current = null
        then?.()
      },
      pendingOpen.current ? 250 : dismissFallbackMs
    )
    return () => clearTimeout(timer)
  }, [mounted, open, dismissFallbackMs])

  // A popover left open while its screen navigates away would sit over the
  // next screen, or take a modal presented on it down with it.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        request.current += 1
        pendingOpen.current = false
        openRef.current = false
        setOpenState(false)
      }),
    [navigation]
  )

  return {
    triggerRef,
    mounted,
    open,
    maxHeight,
    show,
    /** The platform reports the popover open or closed (e.g. a tap outside). */
    setPresented: (next: boolean) => (next ? setOpen(true) : close()),
    contentLaidOut,
    /** The platform finished dismissing the popover. */
    dismissed,
    controls: { close, closeThen } satisfies PopoverControls,
  }
}

/**
 * The content's own scroll view, capped to the room beside the trigger. It is
 * also the viewport that visibility checks (supporter gate impressions) measure
 * against.
 */
export function PopoverContent({
  width,
  maxHeight,
  style,
  controls,
  onLayout,
  children,
}: {
  width: number
  maxHeight?: number
  style: PopoverProps['contentStyle']
  controls: PopoverControls
  onLayout: () => void
  children: ReactNode
}) {
  const viewportRef = useRef<View>(null)
  return (
    <View ref={viewportRef} collapsable={false} onLayout={onLayout}>
      <ScrollView
        style={{ width, maxHeight }}
        contentContainerStyle={[{ padding: 12 }, style]}
        bounces={false}
      >
        <VisibilityViewportContext value={viewportRef}>
          <PopoverContext value={controls}>{children}</PopoverContext>
        </VisibilityViewportContext>
      </ScrollView>
    </View>
  )
}
