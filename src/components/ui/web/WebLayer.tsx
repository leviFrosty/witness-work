import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { View } from 'react-native'
import useTheme from '@/contexts/theme'
import { isRtlLayout } from '@/lib/direction'
import { FOCUSABLE } from '@/components/ui/web/focusTrap'
import {
  type OverlayPlacement,
  type PlacedOverlay,
  placeOverlay,
} from '@/components/ui/web/overlayPosition'

/** How many frames a layer re-measures its anchor for after the page shifts. */
const FOLLOW_FRAMES = 30

/** Above RN-web's modals and Tamagui's sheets (100,000 and up). */
const Z_INDEX = 2_000_000

/** The layers that are open, so Escape closes only the topmost. */
const openLayers: symbol[] = []

/**
 * Presses that landed inside a layer's React tree, which isn't always its DOM
 * subtree: something it renders in a portal (a modal's crop editor) is outside
 * the layer's element, yet a press on it isn't a press outside the layer.
 */
const pressesInside = new WeakSet<Event>()

/** `node` if it takes focus, else the first thing inside it that does. */
const focusable = (node: HTMLElement | null | undefined) =>
  node?.matches(FOCUSABLE)
    ? node
    : (node?.querySelector<HTMLElement>(FOCUSABLE) ?? null)

/**
 * A view's DOM node, once it has mounted, to anchor a layer to. React Native
 * Web hands a view's ref its node, so measuring and focusing work on it
 * directly. Pass `ref` to the view.
 */
export function useAnchor() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const ref = (node: View | null) =>
    setAnchor(node as unknown as HTMLElement | null)
  return [anchor, ref] as const
}

export type WebLayerClose = 'escape' | 'outside' | 'tab'

type Props = {
  /** What the layer opens beside. */
  anchor: HTMLElement | null
  /**
   * Opens at this point of the viewport instead, as a menu does at the pointer.
   * The anchor still says where the layer mounts and where focus returns, and a
   * press on it outside the layer closes it.
   */
  at?: { x: number; y: number } | null
  /** Where focus goes back to on closing. Defaults to the anchor. */
  returnFocusTo?: HTMLElement | null
  open: boolean
  onClose: (reason: WebLayerClose) => void
  placement?: OverlayPlacement
  role: 'menu' | 'dialog'
  label?: string
  /** At least as wide as the anchor, like a select's list. */
  matchAnchorWidth?: boolean
  /** Tab cycles within the layer, instead of closing it (menus close). */
  trapFocus?: boolean
  children: ReactNode
  style?: CSSProperties
}

/**
 * A panel beside its trigger, in the page's DOM: positioned in the viewport
 * (flipped and clamped), closed by Escape or a press outside it, and giving
 * focus back to the trigger. It mounts in the trigger's own modal `<dialog>` if
 * there is one, since a modal dialog makes everything outside it inert.
 */
export default function WebLayer({
  anchor,
  at = null,
  returnFocusTo = anchor,
  open,
  onClose,
  placement,
  role,
  label,
  matchAnchorWidth = false,
  trapFocus = false,
  children,
  style,
}: Props) {
  const theme = useTheme()
  const layerRef = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<PlacedOverlay | null>(null)
  const [minWidth, setMinWidth] = useState<number>()
  const rtl = isRtlLayout()
  const { side, align, gap, margin } = placement ?? {}
  const handleClose = useEffectEvent(onClose)
  const returnFocus = useEffectEvent(() => returnFocusTo)

  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!open || !anchor || !layer) {
      setPlaced(null)
      return
    }
    const reposition = () => {
      const rect = at
        ? new DOMRect(at.x, at.y, 1, 1)
        : anchor.getBoundingClientRect()
      if (matchAnchorWidth) setMinWidth(rect.width)
      setPlaced(
        placeOverlay({
          anchor: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },
          // The natural size, not as capped last time.
          size: { width: layer.offsetWidth, height: layer.scrollHeight },
          viewport: { width: window.innerWidth, height: window.innerHeight },
          placement: { side, align, gap, margin, rtl },
        })
      )
    }
    // Scrolling the page under a menu opened at a point would leave it
    // pointing at nothing, so it closes; one beside its trigger follows it.
    const onScroll = (event: Event) => {
      if (!at) return reposition()
      if (!layer.contains(event.target as Node)) handleClose('outside')
    }
    // The page re-lays itself out a few frames after a resize (or a sidebar
    // folding), so the anchor is measured again for a moment: the layer
    // follows it as it moves, and the loop idles the rest of the time.
    let frame = 0
    let frames = 0
    let seen = ''
    const follow = () => {
      const rect = anchor.getBoundingClientRect()
      const now = `${rect.left},${rect.top},${rect.width},${rect.height},${window.innerWidth},${window.innerHeight}`
      if (now !== seen) {
        seen = now
        reposition()
      }
      frames -= 1
      frame = frames > 0 ? requestAnimationFrame(follow) : 0
    }
    const watch = () => {
      if (at) return
      const idle = frames <= 0
      frames = FOLLOW_FRAMES
      if (idle) frame = requestAnimationFrame(follow)
    }
    reposition()
    watch()
    // The content (a submenu, loaded text) may change its size.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(reposition)
    observer?.observe(layer)
    // Anything that moves the anchor without a resize (a sidebar folding)
    // changes the size of the page or of the anchor.
    const moved =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(watch)
    moved?.observe(anchor)
    moved?.observe(document.body)
    // A point the pointer chose means nothing once the window changes shape.
    const onResize = () => {
      if (at) return handleClose('outside')
      reposition()
      watch()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      moved?.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, anchor, at, matchAnchorWidth, rtl, side, align, gap, margin])

  useEffect(() => {
    const layer = layerRef.current
    if (!open || !anchor || !layer) return
    const token = Symbol('layer')
    openLayers.push(token)
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || openLayers.at(-1) !== token) return
      // Not the modal dialog's own Escape behind it.
      event.preventDefault()
      event.stopPropagation()
      handleClose('escape')
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || layer.contains(target)) return
      // The trigger toggles the layer itself.
      if (!at && anchor.contains(target)) return
      // React's own handlers run after this one: wait to see if the layer's
      // tree claims the press.
      const topmost = openLayers.at(-1) === token
      setTimeout(() => {
        if (topmost && !pressesInside.has(event)) handleClose('outside')
      })
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      openLayers.splice(openLayers.indexOf(token), 1)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      // Back to the trigger, unless focus already went somewhere else.
      const active = document.activeElement
      const target = focusable(returnFocus())
      if (
        target?.isConnected &&
        (!active || active === document.body || layer.contains(active))
      )
        target.focus({ preventScroll: true })
    }
  }, [open, anchor, at])

  // Focus moves in once it's visible (an element that isn't can't take it):
  // to the content that asks for it, else the layer itself.
  const ready = placed !== null
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!open || !ready || !layer || layer.contains(document.activeElement))
      return
    const wanted = layer.querySelector<HTMLElement>('[data-initial-focus]')
    ;(wanted ?? layer).focus({ preventScroll: true })
  }, [open, ready])

  if (!open || !anchor) return null
  const container = anchor.closest('dialog') ?? document.body

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    if (!trapFocus) {
      onClose('tab')
      return
    }
    const layer = layerRef.current
    if (!layer) return
    const items = [...layer.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const first = items[0]
    const last = items.at(-1)
    if (!first || !last) {
      event.preventDefault()
      return
    }
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === layer)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      ref={layerRef}
      role={role}
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(event) => pressesInside.add(event.nativeEvent)}
      style={{
        position: 'fixed',
        zIndex: Z_INDEX,
        boxSizing: 'border-box',
        left: placed?.left ?? 0,
        top: placed?.top ?? 0,
        // Invisible until placed, so it doesn't flash at the corner.
        visibility: placed ? 'visible' : 'hidden',
        maxHeight: placed ? placed.maxHeight : undefined,
        minWidth,
        overflowY: 'auto',
        outline: 'none',
        color: theme.colors.text,
        backgroundColor: theme.colors.card,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.numbers.borderRadiusMd,
        boxShadow: `0 4px 16px ${theme.colors.shadow}26`,
        ...style,
      }}
    >
      {children}
    </div>,
    container
  )
}
