import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { Keyboard, ScrollView, useWindowDimensions, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { VisibilityViewportContext } from '@/contexts/visibilityViewport'
import { PopoverContext } from '@/components/ui/popoverContext'
import { usePopoverTouchShield } from '@/components/ui/popoverTouchShield'
import type {
  PopoverControls,
  PopoverProps,
} from '@/components/ui/Popover.types'

const KEYBOARD_SETTLE_FALLBACK_MS = 600

export function usePopoverPresentation({
  edge,
  dismissFallbackMs,
}: {
  edge: number

  dismissFallbackMs: number
}) {
  const navigation = useNavigation()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const triggerRef = useRef<View>(null)
  const contentRef = useRef<View>(null)
  const [mounted, setMounted] = useState(false)
  const [open, setOpenState] = useState(false)
  const [maxHeight, setMaxHeight] = useState<number>()
  const openRef = useRef(false)
  const afterDismiss = useRef<(() => void) | null>(null)
  const request = useRef(0)

  const pendingOpen = useRef(false)
  const holdId = useId()

  useTakeoverHold(`popover:${holdId}`, mounted)
  usePopoverTouchShield(`popover:${holdId}`, mounted, contentRef)

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
    contentRef,
    mounted,
    open,
    maxHeight,
    show,

    setPresented: (next: boolean) => (next ? setOpen(true) : close()),
    contentLaidOut,

    dismissed,
    controls: { close, closeThen } satisfies PopoverControls,
  }
}

export function PopoverContent({
  contentRef,
  width,
  maxHeight,
  style,
  controls,
  onLayout,
  children,
}: {
  contentRef: RefObject<View | null>
  width: number
  maxHeight?: number
  style: PopoverProps['contentStyle']
  controls: PopoverControls
  onLayout: () => void
  children: ReactNode
}) {
  return (
    <View ref={contentRef} collapsable={false} onLayout={onLayout}>
      <ScrollView
        style={{ width, maxHeight }}
        contentContainerStyle={[{ padding: 12 }, style]}
        bounces={false}
      >
        <VisibilityViewportContext value={contentRef}>
          <PopoverContext value={controls}>{children}</PopoverContext>
        </VisibilityViewportContext>
      </ScrollView>
    </View>
  )
}
