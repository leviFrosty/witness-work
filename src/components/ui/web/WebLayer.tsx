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
import FocusGuard from '@/components/ui/web/FocusGuard'
import { FOCUSABLE } from '@/components/ui/web/focusTrap'
import {
  type OverlayPlacement,
  type PlacedOverlay,
  placeOverlay,
} from '@/components/ui/web/overlayPosition'

const FOLLOW_FRAMES = 30

const Z_INDEX = 2_000_000

const openLayers: symbol[] = []

const pressesInside = new WeakSet<Event>()

const focusable = (node: HTMLElement | null | undefined) =>
  node?.matches(FOCUSABLE)
    ? node
    : (node?.querySelector<HTMLElement>(FOCUSABLE) ?? null)

export function useAnchor() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const ref = (node: View | null) =>
    setAnchor(node as unknown as HTMLElement | null)
  return [anchor, ref] as const
}

export type WebLayerClose = 'escape' | 'outside' | 'tab'

type Props = {
  anchor: HTMLElement | null

  at?: { x: number; y: number } | null

  returnFocusTo?: HTMLElement | null
  open: boolean
  onClose: (reason: WebLayerClose) => void
  placement?: OverlayPlacement
  role: 'menu' | 'dialog'
  label?: string

  matchAnchorWidthUpTo?: number

  trapFocus?: boolean
  children: ReactNode
  style?: CSSProperties
}

export default function WebLayer({
  anchor,
  at = null,
  returnFocusTo = anchor,
  open,
  onClose,
  placement,
  role,
  label,
  matchAnchorWidthUpTo,
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
      if (matchAnchorWidthUpTo !== undefined)
        setMinWidth(Math.min(rect.width, matchAnchorWidthUpTo))
      setPlaced(
        placeOverlay({
          anchor: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },

          size: { width: layer.offsetWidth, height: layer.scrollHeight },
          viewport: { width: window.innerWidth, height: window.innerHeight },
          placement: { side, align, gap, margin, rtl },
        })
      )
    }

    const onScroll = (event: Event) => {
      if (!at) return reposition()
      if (!layer.contains(event.target as Node)) handleClose('outside')
    }

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

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(reposition)
    observer?.observe(layer)

    const moved =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(watch)
    moved?.observe(anchor)
    moved?.observe(document.body)

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
  }, [open, anchor, at, matchAnchorWidthUpTo, rtl, side, align, gap, margin])

  useEffect(() => {
    const layer = layerRef.current
    if (!open || !anchor || !layer) return
    const token = Symbol('layer')
    openLayers.push(token)
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || openLayers.at(-1) !== token) return

      event.preventDefault()
      event.stopPropagation()
      handleClose('escape')
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || layer.contains(target)) return

      if (!at && anchor.contains(target)) return

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

      const active = document.activeElement
      const target = focusable(returnFocus())
      if (
        target?.isConnected &&
        (!active || active === document.body || layer.contains(active))
      )
        target.focus({ preventScroll: true })
    }
  }, [open, anchor, at])

  const ready = placed !== null

  const enter = useEffectEvent(() => {
    const layer = layerRef.current
    if (!layer || !anchor || typeof layer.animate !== 'function') return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const from = at
      ? new DOMRect(at.x, at.y, 1, 1)
      : anchor.getBoundingClientRect()
    const below =
      layer.getBoundingClientRect().top >= from.top + from.height / 2
    layer.animate(
      [
        { opacity: 0, transform: `translateY(${below ? -4 : 4}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 140, easing: 'cubic-bezier(.2,.9,.3,1)' }
    )
  })
  useLayoutEffect(() => {
    if (open && ready) enter()
  }, [open, ready])

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
    }
  }

  return createPortal(
    <>
      <FocusGuard
        edge='start'
        active={trapFocus && open && ready}
        containerRef={layerRef}
      />
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

          visibility: placed ? 'visible' : 'hidden',
          maxHeight: placed ? placed.maxHeight : undefined,
          minWidth,
          overflowY: 'auto',
          outline: 'none',
          color: theme.colors.text,
          backgroundColor: theme.colors.card,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.numbers.borderRadiusMd,
          boxShadow: `0 8px 28px ${theme.colors.shadow}33`,
          ...style,
        }}
      >
        {children}
      </div>
      <FocusGuard
        edge='end'
        active={trapFocus && open && ready}
        containerRef={layerRef}
      />
    </>,
    container
  )
}
