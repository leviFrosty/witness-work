import { ReactElement, useEffect, useState } from 'react'
import {
  Gesture,
  GestureDetector,
  PointerType,
} from 'react-native-gesture-handler'
import Animated, {
  type AnimatedRef,
  type SharedValue,
  measure,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets'
import Haptics from '@/lib/haptics'
import {
  RowWidths,
  reorderForDrag,
  rowLength,
  rowSlots,
} from '@/lib/sortableRow'

/**
 * A touch held this long, then moved, drags its row; a quicker move scrolls.
 * Longer than a chip row's, since the list scrolls the same way it drags.
 */
const HOLD_MS = 350
/** Movement that ends a hold, as a drag or a scroll. */
const SLOP = 8
/** Movement on the drag handle that starts a drag. */
const HANDLE_SLOP = 2
/**
 * How near the scroll view's edge a dragged row starts scrolling it, at most;
 * short scroll views use a smaller share of their height.
 */
const EDGE = 64
/** Travel toward an edge before it scrolls, so a drag begun there doesn't. */
const EDGE_TRAVEL = 16
/** Scroll speed, in points per second, with the finger at the very edge. */
const MAX_SCROLL_SPEED = 700
const SETTLE = { duration: 200 }
const LIFT_SCALE = 1.02

/** Drag state shared by the list and its rows, on the UI thread. */
type ListState = {
  order: SharedValue<readonly string[]>
  heights: SharedValue<RowWidths>
  slots: SharedValue<Record<string, number>>
  /** Every row has been measured, so each sits at its slot. */
  placed: SharedValue<boolean>
  active: SharedValue<string | null>
  /** The dragged row's top edge in the list. */
  dragTop: SharedValue<number>
  /** The dragged row's slot and the scroll offset when the drag began. */
  start: SharedValue<{ top: number; scroll: number }>
  /** How far the finger has moved since then. */
  travel: SharedValue<number>
  /** Scroll offset while dragging, including auto-scroll. */
  scroll: SharedValue<number>
  /** The finger, in window points, for auto-scroll. */
  fingerY: SharedValue<number>
  /** The scroll view's frame and the list's top in its content, at drag start. */
  frame: SharedValue<{ top: number; height: number; listTop: number }>
}

/**
 * A vertical list the User reorders by dragging: touch and hold a row, then
 * drag it, or drag at once from the row's trailing `handleWidth` points (where
 * a grip sits). A quick swipe still scrolls `scrollRef`, which also scrolls
 * while a dragged row nears its edges. A pointer drags without the hold. Screen
 * readers need their own way to move rows; give rows `accessibilityActions`.
 */
export default function SortableList<T>({
  data,
  keyExtractor,
  renderItem,
  onReorder,
  scrollRef,
  enabled = true,
  handleWidth = 0,
  onDragChange,
}: {
  data: T[]
  keyExtractor: (item: T) => string
  renderItem: (item: T, index: number) => ReactElement
  /** Called once per drop that changed the order. */
  onReorder: (next: T[]) => void
  /** The scroll view holding the list. */
  scrollRef: AnimatedRef<Animated.ScrollView>
  enabled?: boolean
  /** Touches this close to a row's trailing edge drag without the hold. */
  handleWidth?: number
  /** A drag began or ended; e.g. to stop the scroll view scrolling meanwhile. */
  onDragChange?: (dragging: boolean) => void
}) {
  const keys = data.map(keyExtractor)
  const keySignature = keys.join('\n')
  const listRef = useAnimatedRef<Animated.View>()
  const scrollOffset = useScrollOffset(scrollRef)
  // Rows sit in a normal column until each is measured, then move to absolute
  // slots, so a drop never waits on a re-layout to land.
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [widths, setWidths] = useState<Record<string, number>>({})
  const measured = keys.length > 0 && keys.every((key) => key in heights)

  const order = useSharedValue<readonly string[]>(keys)
  const heightsValue = useSharedValue<RowWidths>({})
  const placed = useSharedValue(false)
  const list: ListState = {
    order,
    heights: heightsValue,
    slots: useDerivedValue(() => rowSlots(order.value, heightsValue.value, 0)),
    placed,
    active: useSharedValue<string | null>(null),
    dragTop: useSharedValue(0),
    start: useSharedValue({ top: 0, scroll: 0 }),
    travel: useSharedValue(0),
    scroll: useSharedValue(0),
    fingerY: useSharedValue(0),
    frame: useSharedValue({ top: 0, height: 0, listTop: 0 }),
  }

  // The owner's order replaces the list's, except mid-drag.
  useEffect(() => {
    if (list.active.value === null)
      list.order.value = keySignature ? keySignature.split('\n') : []
  }, [keySignature, list.active, list.order])

  useEffect(() => {
    scheduleOnUI(() => {
      'worklet'
      heightsValue.value = heights
      placed.value = measured
    })
  }, [heights, measured, heightsValue, placed])

  const measureRow = (key: string, height: number, width: number) => {
    setHeights((current) =>
      current[key] === height ? current : { ...current, [key]: height }
    )
    setWidths((current) =>
      current[key] === width ? current : { ...current, [key]: width }
    )
  }

  const autoScroll = useFrameCallback((frame) => {
    const key = list.active.value
    if (key === null) return
    const { top, height, listTop } = list.frame.value
    const y = list.fingerY.value
    const edge = Math.min(EDGE, height * 0.15)
    const travel = list.travel.value
    const overflow =
      y < top + edge && travel < -EDGE_TRAVEL
        ? y - (top + edge)
        : y > top + height - edge && travel > EDGE_TRAVEL
          ? y - (top + height - edge)
          : 0
    if (overflow === 0) return
    const speed = MAX_SCROLL_SPEED * Math.max(-1, Math.min(1, overflow / edge))
    const listHeight = rowLength(list.order.value, list.heights.value, 0)
    const maxScroll = Math.max(0, listTop + listHeight + edge - height)
    const scroll = Math.max(
      0,
      Math.min(
        maxScroll,
        list.scroll.value +
          (speed * (frame.timeSincePreviousFrame ?? 16)) / 1000
      )
    )
    if (scroll === list.scroll.value) return
    list.scroll.value = scroll
    scrollTo(scrollRef, 0, scroll, false)
    follow(list, key)
  }, false)

  const dragStarted = () => {
    autoScroll.setActive(true)
    onDragChange?.(true)
    void Haptics.medium()
  }

  const dragEnded = (next: readonly string[], changed: boolean) => {
    autoScroll.setActive(false)
    onDragChange?.(false)
    if (!changed) return
    const byKey = new Map(data.map((item) => [keyExtractor(item), item]))
    onReorder(next.flatMap((key) => byKey.get(key) ?? []))
  }

  const beginDrag = (key: string, fingerY: number, travel: number) => {
    'worklet'
    const scrollFrame = measure(scrollRef)
    const listFrame = measure(listRef)
    if (scrollFrame && listFrame) {
      list.frame.value = {
        top: scrollFrame.pageY,
        height: scrollFrame.height,
        listTop: listFrame.pageY - scrollFrame.pageY + scrollOffset.value,
      }
    }
    const slot = list.slots.value[key] ?? 0
    list.scroll.value = scrollOffset.value
    list.start.value = { top: slot, scroll: scrollOffset.value }
    list.travel.value = travel
    list.fingerY.value = fingerY
    list.dragTop.value = slot + travel
    list.active.value = key
  }

  const measuredKeys = keys.filter((key) => key in heights)
  const placedStyle = measured
    ? { height: rowLength(measuredKeys, heights, 0) }
    : null

  return (
    <Animated.View ref={listRef} style={placedStyle}>
      {data.map((item, index) => {
        const key = keyExtractor(item)
        return (
          <SortableRow
            key={key}
            itemKey={key}
            list={list}
            enabled={enabled && measured && keys.length > 1}
            handleFrom={
              handleWidth > 0 && widths[key] ? widths[key] - handleWidth : null
            }
            onMeasure={measureRow}
            beginDrag={beginDrag}
            onDragStarted={dragStarted}
            onDragEnded={dragEnded}
            onOrderChanged={() => void Haptics.selection()}
          >
            {renderItem(item, index)}
          </SortableRow>
        )
      })}
    </Animated.View>
  )
}

/**
 * Keeps the dragged row under the finger as the finger or the list scrolls, and
 * moves it past the rows it crosses. Returns whether the order changed.
 */
function follow(list: ListState, key: string): boolean {
  'worklet'
  const { top, scroll } = list.start.value
  list.dragTop.value = top + list.travel.value + (list.scroll.value - scroll)
  const next = reorderForDrag(
    list.order.value,
    key,
    list.dragTop.value,
    list.heights.value,
    0
  )
  if (next === list.order.value) return false
  list.order.value = next
  return true
}

function SortableRow({
  itemKey: key,
  list,
  enabled,
  handleFrom,
  onMeasure,
  beginDrag,
  onDragStarted,
  onDragEnded,
  onOrderChanged,
  children,
}: {
  itemKey: string
  list: ListState
  enabled: boolean
  /** Where the drag handle starts, from the row's leading edge. */
  handleFrom: number | null
  onMeasure: (key: string, height: number, width: number) => void
  beginDrag: (key: string, fingerY: number, travel: number) => void
  onDragStarted: () => void
  onDragEnded: (order: readonly string[], changed: boolean) => void
  onOrderChanged: () => void
  children: ReactElement
}) {
  /** Top edge while sliding to a new slot; otherwise the row sits at it. */
  const y = useSharedValue(0)
  const sliding = useSharedValue(false)
  const touch = useSharedValue({ y: 0, at: 0, pointer: false, handle: false })
  const orderAtStart = useSharedValue<readonly string[]>([])
  const lift = useDerivedValue(() =>
    withTiming(list.active.value === key ? 1 : 0, SETTLE)
  )

  // Slides aside while another row is dragged past, and into its slot when
  // dropped. Any other change (measuring, a row added or removed) jumps.
  useAnimatedReaction(
    () => [list.slots.value[key], list.active.value] as const,
    ([slot, active], previous) => {
      if (slot === undefined || active === key || !previous) return
      const [previousSlot, previousActive] = previous
      let from: number
      if (previousActive === key) from = list.dragTop.value
      else if (
        active !== null &&
        previousSlot !== undefined &&
        previousSlot !== slot
      )
        from = sliding.value ? y.value : previousSlot
      else return
      y.value = from
      sliding.value = true
      y.value = withTiming(slot, SETTLE, (finished) => {
        if (finished) sliding.value = false
      })
    }
  )

  const style = useAnimatedStyle(() => {
    if (!list.placed.value) return {}
    const slot = list.slots.value[key]
    const active = list.active.value === key
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      opacity: active || slot !== undefined ? 1 : 0,
      zIndex: lift.value > 0 ? 1 : 0,
      shadowOpacity: lift.value * 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      transform: [
        {
          translateY: active
            ? list.dragTop.value
            : sliding.value
              ? y.value
              : (slot ?? 0),
        },
        { scale: 1 + lift.value * (LIFT_SCALE - 1) },
      ],
    }
  })

  const gesture = Gesture.Manual()
    .enabled(enabled)
    .onTouchesDown((e, manager) => {
      const point = e.allTouches[0]
      if (!point || e.numberOfTouches > 1 || list.active.value !== null) {
        manager.fail()
        return
      }
      touch.value = {
        y: point.absoluteY,
        at: Date.now(),
        pointer: e.pointerType === PointerType.MOUSE,
        handle: handleFrom !== null && point.x >= handleFrom,
      }
    })
    .onTouchesMove((e, manager) => {
      const point = e.allTouches[0]
      if (!point) return
      const start = touch.value
      if (list.active.value === key) {
        list.fingerY.value = point.absoluteY
        list.travel.value = point.absoluteY - start.y
        if (follow(list, key)) scheduleOnRN(onOrderChanged)
        return
      }
      const moved = Math.abs(point.absoluteY - start.y)
      if (moved < (start.handle ? HANDLE_SLOP : SLOP)) return
      const held = Date.now() - start.at
      if (!start.pointer && !start.handle && held < HOLD_MS) {
        manager.fail()
        return
      }
      orderAtStart.value = list.order.value
      beginDrag(key, point.absoluteY, point.absoluteY - start.y)
      manager.activate()
      scheduleOnRN(onDragStarted)
    })
    .onTouchesUp((_e, manager) => manager.end())
    .onTouchesCancelled((_e, manager) => manager.fail())
    .onFinalize(() => {
      if (list.active.value !== key) return
      const order = list.order.value
      list.active.value = null
      scheduleOnRN(
        onDragEnded,
        order,
        order.join('\n') !== orderAtStart.value.join('\n')
      )
    })

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={(e) => {
          const { height, width } = e.nativeEvent.layout
          onMeasure(key, height, width)
        }}
        style={style}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  )
}
