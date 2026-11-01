import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Haptics from '@/lib/haptics'
import { isRtlLayout } from '@/lib/direction'
import {
  type Rect,
  ReorderableContext,
  type ReorderableEntry,
  ReorderableGhostContext,
  type WindowPoint,
} from '@/components/ui/reorderable/context'
import { removeBadgeTargetInset } from '@/components/ui/reorderable/RemoveBadge'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import type { ReorderScroller } from '@/components/ui/reorderable/useReorderScroller'

export const LIFT_DELAY_MS = 350

const AUTOSCROLL_EDGE = 90

const AUTOSCROLL_SLOP = 12

const AUTOSCROLL_SPEED = 14

const MOVE_COOLDOWN_MS = 220
const DROP_MS = 200
const LIFTED_SCALE = 1.04

const BADGE_REACH = MIN_TOUCH_TARGET / 2 + 3
const HANDLE_REACH = 30

const ITEM_SLOP = 4

type Props<Id extends string> = {
  editing: boolean
  children: ReactNode

  onMove: (id: Id, target: Id) => void

  onLiftToEdit?: (id: Id) => void

  onBackgroundLongPress?: () => void

  onBackgroundPress?: () => void

  onDragChange?: (dragging: boolean) => void

  scroller?: ReorderScroller
  style?: StyleProp<ViewStyle>
}

type Drag = {
  id: string

  via: 'container' | 'item'

  grab: { x: number; y: number }

  point: { x: number; y: number }

  pointOffset: number
  absoluteY: number

  liftedAt: { x: number; y: number }

  window: WindowPoint | null

  moved: boolean
  movedAt: number

  lastTarget: string | null
  frame: number | null
}

const toXY = ({ absoluteX, absoluteY }: WindowPoint) => ({
  x: absoluteX,
  y: absoluteY,
})

const contains = (rect: Rect, x: number, y: number, slop = 0) => {
  'worklet'
  return (
    x >= rect.x - slop &&
    x <= rect.x + rect.width + slop &&
    y >= rect.y - slop &&
    y <= rect.y + rect.height + slop
  )
}

type TouchZones = {
  items: Rect[]

  chrome: { x: number; y: number; reach: number; square: boolean }[]
}

const onChromeAt = (zones: TouchZones, x: number, y: number) => {
  'worklet'
  for (const c of zones.chrome) {
    const near = c.square
      ? Math.abs(x - c.x) < c.reach && Math.abs(y - c.y) < c.reach
      : Math.hypot(x - c.x, y - c.y) < c.reach
    if (near) return true
  }
  return false
}

const onItemAt = (zones: TouchZones, x: number, y: number, slop: number) => {
  'worklet'
  for (const rect of zones.items) {
    if (contains(rect, x, y, slop)) return true
  }
  return false
}

export default function ReorderableContainer<Id extends string>({
  editing,
  children,
  onMove,
  onLiftToEdit,
  onBackgroundLongPress,
  onBackgroundPress,
  onDragChange,
  scroller,
  style,
}: Props<Id>) {
  const rtl = isRtlLayout()
  const containerRef = useRef<View>(null)
  const entries = useRef(new Map<string, ReorderableEntry>())
  const drag = useRef<Drag | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)

  const lastRects = useRef(new Map<string, Rect>())
  const zonesFrame = useRef<number | null>(null)

  const liftOrigin = useRef<{ x: number; y: number; offset: number } | null>(
    null
  )
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [resizingId, setResizingId] = useState<string | null>(null)

  const [, setGhostVersion] = useState(0)
  const [width, setWidth] = useState(0)
  const ghostX = useSharedValue(0)
  const ghostY = useSharedValue(0)
  const ghostScale = useSharedValue(1)
  const ghostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: ghostX.value },
      { translateY: ghostY.value },
      { scale: ghostScale.value },
    ],
  }))

  useEffect(
    () => () => {
      if (drag.current?.frame) cancelAnimationFrame(drag.current.frame)
      if (settle.current) clearTimeout(settle.current)
      if (zonesFrame.current !== null) cancelAnimationFrame(zonesFrame.current)
    },
    []
  )

  const offset = () => scroller?.offset() ?? 0

  const itemAt = (x: number, y: number, slop = 0) => {
    for (const [id, entry] of entries.current) {
      if (entry.rect && contains(entry.rect, x, y, slop)) return { id, entry }
    }
    return null
  }

  const zones = useSharedValue<TouchZones>({ items: [], chrome: [] })

  const syncZones = () => {
    const next: TouchZones = { items: [], chrome: [] }
    for (const entry of entries.current.values()) {
      const { rect } = entry
      if (!rect) continue
      next.items.push(rect)
      if (entry.locked) continue
      if (entry.removable) {
        const inset = removeBadgeTargetInset(entry.radius)
        next.chrome.push({
          x: rtl ? rect.x + rect.width - inset : rect.x + inset,
          y: rect.y + entry.boxTop + inset,
          reach: BADGE_REACH,
          square: true,
        })
      }
      if (entry.resizable) {
        next.chrome.push({
          x: rtl ? rect.x : rect.x + rect.width,
          y: rect.y + rect.height,
          reach: HANDLE_REACH,
          square: true,
        })
      }
    }
    zones.value = next
  }

  const scheduleSyncZones = () => {
    if (zonesFrame.current !== null) return
    zonesFrame.current = requestAnimationFrame(() => {
      zonesFrame.current = null
      syncZones()
    })
  }

  const placeGhost = (x: number, y: number) => {
    const d = drag.current
    const rect = d ? entries.current.get(d.id)?.rect : null

    const base = rtl && rect ? width - rect.width : 0
    ghostX.value = x - base
    ghostY.value = y
  }

  const follow = () => {
    const d = drag.current
    if (!d) return
    const x = d.point.x
    const y = d.point.y + offset() - d.pointOffset
    placeGhost(x - d.grab.x, y - d.grab.y)
    if (!d.moved) return
    const now = Date.now()
    if (now - d.movedAt < MOVE_COOLDOWN_MS) return
    const under = (id: string) => {
      const rect = entries.current.get(id)?.rect
      return rect ? contains(rect, x, y) : false
    }
    if (d.lastTarget && !under(d.lastTarget)) d.lastTarget = null
    let target: string | null = null
    for (const [id, entry] of entries.current) {
      if (id === d.id || id === d.lastTarget) continue
      if (!entry.movable || entry.locked || !under(id)) continue
      target = id
      break
    }
    if (!target) return
    d.lastTarget = target
    d.movedAt = now
    Haptics.selection()
    onMove(d.id as Id, target as Id)
  }

  const autoScroll = () => {
    const d = drag.current
    if (!d || !scroller) return
    const { top, height } = scroller.viewport()
    let speed = 0

    if (!d.moved) {
      d.frame = requestAnimationFrame(autoScroll)
      return
    }
    if (d.absoluteY < top + AUTOSCROLL_EDGE) {
      speed = -((top + AUTOSCROLL_EDGE - d.absoluteY) / AUTOSCROLL_EDGE)
    } else if (d.absoluteY > top + height - AUTOSCROLL_EDGE) {
      speed = (d.absoluteY - (top + height - AUTOSCROLL_EDGE)) / AUTOSCROLL_EDGE
    }
    if (speed !== 0) {
      const max = Math.max(0, scroller.contentHeight() - height)
      const from = scroller.offset()
      const to = Math.min(
        max,
        Math.max(0, from + Math.max(-1, Math.min(1, speed)) * AUTOSCROLL_SPEED)
      )
      if (to !== from) {
        scroller.scrollTo(to)
        follow()
      }
    }
    d.frame = requestAnimationFrame(autoScroll)
  }

  const pickUp = (
    id: string,
    via: Drag['via'],
    point: { x: number; y: number },
    absolute: { x: number; y: number },
    window: WindowPoint | null = null
  ) => {
    const rect = entries.current.get(id)?.rect
    if (!rect || drag.current) return

    if (settle.current) {
      clearTimeout(settle.current)
      settle.current = null
    }
    drag.current = {
      id,
      via,
      grab: { x: point.x - rect.x, y: point.y - rect.y },
      point,
      pointOffset: offset(),
      absoluteY: absolute.y,
      liftedAt: absolute,
      window,
      moved: false,
      movedAt: 0,
      lastTarget: null,
      frame: null,
    }
    placeGhost(rect.x, rect.y)
    ghostScale.value = 1
    ghostScale.value = withSpring(LIFTED_SCALE, { damping: 14, stiffness: 260 })
    setDraggedId(id)
    onDragChange?.(true)
    Haptics.medium()
    drag.current.frame = requestAnimationFrame(autoScroll)
  }

  const moveTo = (
    point: { x: number; y: number },
    absolute: { x: number; y: number }
  ) => {
    const d = drag.current
    if (!d) return
    d.point = point
    d.pointOffset = offset()
    d.absoluteY = absolute.y
    const travel = Math.hypot(
      absolute.x - d.liftedAt.x,
      absolute.y - d.liftedAt.y
    )
    if (travel >= AUTOSCROLL_SLOP) d.moved = true
    follow()
  }

  const drop = (via: Drag['via']) => {
    const d = drag.current
    if (!d || d.via !== via) return
    drag.current = null
    if (d.frame) cancelAnimationFrame(d.frame)
    const home = entries.current.get(d.id)?.rect
    if (home) {
      const base = rtl ? width - home.width : 0
      ghostX.value = withTiming(home.x - base, { duration: DROP_MS - 20 })
      ghostY.value = withTiming(home.y, { duration: DROP_MS - 20 })
    }
    ghostScale.value = withTiming(1, { duration: DROP_MS - 20 })
    settle.current = setTimeout(() => {
      settle.current = null
      setDraggedId(null)
      onDragChange?.(false)
    }, DROP_MS)
  }

  const fromWindow = ({ absoluteX, absoluteY }: WindowPoint) => {
    const origin = liftOrigin.current
    if (!origin) return null
    return {
      x: absoluteX - origin.x,

      y: absoluteY - origin.y + (offset() - origin.offset),
    }
  }

  const remeasureLift = (refollow: boolean) => {
    if (drag.current?.via !== 'item') return
    containerRef.current?.measureInWindow((x, y) => {
      liftOrigin.current = { x, y, offset: offset() }
      const d = drag.current
      if (!refollow || d?.via !== 'item' || !d.window) return
      const point = fromWindow(d.window)
      if (point) moveTo(point, toXY(d.window))
    })
  }

  const startDrag = (x: number, y: number, absX: number, absY: number) => {
    const hit = itemAt(x, y)
    if (!hit || hit.entry.locked || !hit.entry.movable) return
    pickUp(hit.id, 'container', { x, y }, { x: absX, y: absY })
  }
  const dragTo = (x: number, y: number, absX: number, absY: number) =>
    moveTo({ x, y }, { x: absX, y: absY })
  const endDrag = () => drop('container')
  const pressBackground = () => onBackgroundPress?.()

  const pan = Gesture.Pan()
    .enabled(editing)
    .activateAfterLongPress(LIFT_DELAY_MS)
    .maxPointers(1)
    .onTouchesDown((e, manager) => {
      const touch = e.allTouches[0]
      if (touch && onChromeAt(zones.value, touch.x, touch.y)) manager.fail()
    })
    .onStart((e) => scheduleOnRN(startDrag, e.x, e.y, e.absoluteX, e.absoluteY))
    .onUpdate((e) => scheduleOnRN(dragTo, e.x, e.y, e.absoluteX, e.absoluteY))
    .onFinalize(() => scheduleOnRN(endDrag))

  const tap = Gesture.Tap()
    .enabled(editing && !!onBackgroundPress)
    .maxDuration(300)
    .onTouchesDown((e, manager) => {
      const touch = e.allTouches[0]
      if (
        !touch ||
        onItemAt(zones.value, touch.x, touch.y, ITEM_SLOP) ||
        onChromeAt(zones.value, touch.x, touch.y)
      ) {
        manager.fail()
      }
    })
    .onEnd((_e, success) => {
      if (success) scheduleOnRN(pressBackground)
    })

  const dragged = draggedId ? entries.current.get(draggedId) : undefined

  const content = (
    <>
      {children}
      {dragged?.rect ? (
        <Animated.View
          pointerEvents='none'
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              width: dragged.rect.width,

              minHeight: dragged.rect.height,
              zIndex: 100,
              borderRadius: dragged.radius,
              shadowColor: '#000000',
              shadowOpacity: 0.2,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 10 },
            },
            ghostStyle,
          ]}
        >
          <ReorderableGhostContext.Provider value>
            {dragged.render()}
          </ReorderableGhostContext.Provider>
        </Animated.View>
      ) : null}
    </>
  )

  return (
    <ReorderableContext.Provider
      value={{
        editing,
        draggedId,
        resizingId,
        containerRef,
        canLiftToEdit: !!onLiftToEdit,
        register: (id, entry) => {
          entry.rect ??= lastRects.current.get(id) ?? null
          entries.current.set(id, entry)
          scheduleSyncZones()
          return () => {
            if (entry.rect) lastRects.current.set(id, entry.rect)
            if (entries.current.get(id) === entry) entries.current.delete(id)
            scheduleSyncZones()
          }
        },
        measured: (id) => {
          scheduleSyncZones()
          if (id === drag.current?.id) setGhostVersion((v) => v + 1)
        },
        changed: scheduleSyncZones,
        setResizing: (id) => {
          setResizingId(id)
          onDragChange?.(id !== null)
        },
        lift: {
          begin: () => {
            const startOffset = offset()
            containerRef.current?.measureInWindow((x, y) => {
              liftOrigin.current = { x, y, offset: startOffset }
            })
          },
          start: (id, at) => {
            const point = fromWindow(at)
            if (!point || drag.current) return
            onLiftToEdit?.(id as Id)

            if (entries.current.get(id)?.movable) {
              pickUp(id, 'item', point, toXY(at), at)
            } else Haptics.medium()
          },
          move: (at) => {
            if (drag.current) drag.current.window = at
            const point = fromWindow(at)
            if (point) moveTo(point, toXY(at))
            remeasureLift(false)
          },
          end: () => drop('item'),
          lost: (id) => {
            if (drag.current?.id === id) drop('item')
          },
        },
      }}
    >
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <View
          ref={containerRef}
          collapsable={false}
          onLayout={(e) => {
            setWidth(e.nativeEvent.layout.width)
            remeasureLift(true)
          }}
          style={[style, draggedId ? { zIndex: 10 } : null]}
        >
          {onBackgroundLongPress ? (
            <Pressable
              accessible={false}
              focusable={false}
              importantForAccessibility='no'
              disabled={editing}
              delayLongPress={LIFT_DELAY_MS}
              onLongPress={(e) => {
                const { pageX, pageY } = e.nativeEvent
                containerRef.current?.measureInWindow((x, y) => {
                  if (itemAt(pageX - x, pageY - y)) return
                  Haptics.medium()
                  onBackgroundLongPress()
                })
              }}
              style={{ flex: 1 }}
            >
              {content}
            </Pressable>
          ) : (
            content
          )}
        </View>
      </GestureDetector>
    </ReorderableContext.Provider>
  )
}
