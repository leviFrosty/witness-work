import {
  type ReactElement,
  type ReactNode,
  createElement,
  useRef,
  useState,
} from 'react'
import { Pressable, View } from 'react-native'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import { isRtlLayout } from '@/lib/direction'
import { menuGroups } from '@/components/ui/menuEntries'
import WebLayer, { useAnchor } from '@/components/ui/web/WebLayer'
import WebMenu from '@/components/ui/web/WebMenu'
import type { ContextMenuProps } from '@/components/ui/ContextMenu.types'

export type {
  ContextMenuAction,
  ContextMenuEntries,
  ContextMenuItem,
  ContextMenuProps,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'

/** Held this long, a touch opens the menu, as on a phone. */
const LONG_PRESS_MS = 500

/**
 * The innermost menu answers an event, so a menu around it (a card around a
 * day) sees the mark and stays shut.
 */
const claim = (event: Event) => {
  // The page's own event, which a React event wraps.
  const native = (event as { nativeEvent?: Event }).nativeEvent ?? event
  const marked = native as Event & { wwMenuClaimed?: true }
  if (marked.wwMenuClaimed) return false
  marked.wwMenuClaimed = true
  return true
}
/** A touch that opened the menu shouldn't also press the content on lift. */
const SWALLOW_PRESS_MS = 700

type Point = { x: number; y: number }

/**
 * The menu for a piece of content on the web: a right-click, the Menu key or
 * Shift+F10 on the focused content, or a long press on a touch screen opens it
 * at that spot. Only content with an `onPress` can take the keyboard's focus;
 * as everywhere (`ContextMenu.tsx`), each action must also live somewhere a
 * User can reach without a right-click.
 */
export default function ContextMenu({
  actions,
  children,
  onPress,
  accessibilityLabel,
  accessibilityState,
  accessible = true,
  disabled = false,
  pointerEffect = 'tint',
  hoverRadius,
  onOpenChange,
  style,
  testID,
}: ContextMenuProps) {
  const [content, contentRef] = useAnchor()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const swallowUntil = useRef(0)
  const [point, setPoint] = useState<Point | null>(null)
  const [hovered, setHovered] = useState(false)
  const groups = menuGroups(actions)
  const enabled = groups.length > 0 && !disabled
  const open = point !== null

  const openAt = (next: Point | null) => {
    setPoint(next)
    onOpenChange?.(next !== null)
  }
  const close = () => {
    clearTimeout(timer.current)
    if (open) openAt(null)
  }
  const cancelLongPress = () => clearTimeout(timer.current)

  const listeners = enabled
    ? {
        onContextMenu: (event: MouseEvent) => {
          if (!claim(event)) return
          event.preventDefault()
          openAt({ x: event.clientX, y: event.clientY })
        },
        onKeyDown: (event: KeyboardEvent) => {
          if (
            event.key !== 'ContextMenu' &&
            !(event.key === 'F10' && event.shiftKey)
          )
            return
          if (!claim(event)) return
          event.preventDefault()
          const rect = content?.getBoundingClientRect()
          // Near the leading edge of the content, where its label starts.
          const lead = Math.min(rect?.width ?? 0, 48) / 2
          openAt({
            x: isRtlLayout()
              ? (rect?.right ?? 0) - lead
              : (rect?.left ?? 0) + lead,
            y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
          })
        },
        onTouchStart: (event: TouchEvent) => {
          const touch = event.touches[0]
          if (!touch || !claim(event)) return
          cancelLongPress()
          timer.current = setTimeout(() => {
            swallowUntil.current = Date.now() + SWALLOW_PRESS_MS
            openAt({ x: touch.clientX, y: touch.clientY })
          }, LONG_PRESS_MS)
        },
        onTouchEnd: cancelLongPress,
        onTouchMove: cancelLongPress,
        onTouchCancel: cancelLongPress,
      }
    : {}

  const trigger: ReactNode = onPress ? (
    <Pressable
      ref={contentRef}
      onPress={() => {
        if (Date.now() >= swallowUntil.current) onPress()
      }}
      accessible={accessible}
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      aria-haspopup={enabled ? 'menu' : undefined}
      testID={testID}
      style={({ pressed }) => [
        { borderRadius: hoverRadius },
        pressed && { opacity: 0.7 },
      ]}
    >
      {children}
      <HoverTint
        visible={hovered && pointerEffect !== 'none'}
        borderRadius={hoverRadius}
      />
    </Pressable>
  ) : (
    <View ref={contentRef} testID={testID}>
      {children}
    </View>
  )

  return (
    <View style={style}>
      {/* No box of its own; the events of everything inside reach it. */}
      {createElement(
        'div',
        {
          style: { display: 'contents' },
          onContextMenu: listeners.onContextMenu,
          onKeyDown: listeners.onKeyDown,
          onTouchStart: listeners.onTouchStart,
          onTouchEnd: listeners.onTouchEnd,
          onTouchMove: listeners.onTouchMove,
          onTouchCancel: listeners.onTouchCancel,
        },
        <PointerHover onHoverChange={onPress ? setHovered : undefined}>
          {trigger as ReactElement}
        </PointerHover>
      )}
      <WebLayer
        anchor={content}
        at={point}
        open={open}
        onClose={close}
        returnFocusTo={content}
        role='menu'
        label={accessibilityLabel}
        placement={{ gap: 0 }}
      >
        <WebMenu
          groups={groups}
          onSelect={(action) => {
            close()
            action.onPress()
          }}
        />
      </WebLayer>
    </View>
  )
}
