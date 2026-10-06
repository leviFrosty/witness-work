import { ReactElement, ReactNode, useEffect, useState } from 'react'
import {
  Gesture,
  GestureDetector,
  PointerType,
} from 'react-native-gesture-handler'
import Animated, {
  SharedValue,
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

const GAP = 8
/** A touch held this long, then moved, drags its chip; a quicker move scrolls. */
const HOLD_MS = 200
/** After this, a still touch belongs to the chips' long-press menu. */
const MENU_MS = 450
/** Movement that ends a hold, as a drag or a scroll. */
const SLOP = 8
/** How near the row's edge a dragged chip starts scrolling it. */
const EDGE = 48
/** Scroll speed, in points per second, with the chip at the very edge. */
const MAX_SCROLL_SPEED = 600
const SETTLE = { duration: 200 }
const LIFT_SCALE = 1.06

type Size = { width: number; height: number }

/** Drag state shared by the row and its chips, on the UI thread. */
type RowState = {
  order: SharedValue<readonly string[]>
  widths: SharedValue<RowWidths>
  slots: SharedValue<Record<string, number>>
  /** Every chip has been measured, so each sits at its slot. */
  placed: SharedValue<boolean>
  active: SharedValue<string | null>
  /** The dragged chip's left edge in the row. */
  dragLeft: SharedValue<number>
  /** The dragged chip's slot and the content offset when the drag began. */
  start: SharedValue<{ left: number; scroll: number }>
  /** How far the finger has moved since then. */
  travel: SharedValue<number>
  /** Content offset while dragging, including the row's own scrolling. */
  scroll: SharedValue<number>
}

/**
 * A row of chips that scrolls sideways and that the User can reorder: touch and
 * hold a chip, then drag it along the row, which scrolls when the chip nears
 * either edge. A quick swipe still scrolls and a tap still reaches the chip.
 * With `longPressMenus`, a touch held still opens the chip's own menu instead,
 * so a drag has to start before it would. A pointer drags without the hold.
 * `leading` and `trailing` stay put at the ends.
 */
export default function SortableChipRow<T>({
  data,
  keyExtractor,
  renderItem,
  onReorder,
  sortEnabled = true,
  longPressMenus = false,
  leading,
  trailing,
}: {
  data: T[]
  keyExtractor: (item: T) => string
  renderItem: (item: T) => ReactElement
  /** Called once per drop that changed the order. */
  onReorder: (next: T[]) => void
  sortEnabled?: boolean
  /** The chips open a menu on long press (`ContextMenu`). */
  longPressMenus?: boolean
  leading?: ReactNode
  trailing?: ReactNode
}) {
  const keys = data.map(keyExtractor)
  const keySignature = keys.join('\n')
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollOffset = useScrollOffset(scrollRef)
  const viewportWidth = useSharedValue(0)
  const contentWidth = useSharedValue(0)
  const rowStart = useSharedValue(0)
  // Chips sit in a normal row until each is measured, then move to absolute
  // slots, so a drop never waits on a re-layout to land.
  const [sizes, setSizes] = useState<Record<string, Size>>({})
  const [measured, setMeasured] = useState(false)

  const order = useSharedValue<readonly string[]>(keys)
  const widths = useSharedValue<RowWidths>({})
  const placed = useSharedValue(false)
  const row: RowState = {
    order,
    widths,
    slots: useDerivedValue(() => rowSlots(order.value, widths.value, GAP)),
    placed,
    active: useSharedValue<string | null>(null),
    dragLeft: useSharedValue(0),
    start: useSharedValue({ left: 0, scroll: 0 }),
    travel: useSharedValue(0),
    scroll: useSharedValue(0),
  }

  if (!measured && keys.length > 0 && keys.every((key) => key in sizes)) {
    setMeasured(true)
  }

  // The owner's order (after a drop, a sync, a new chip) replaces the row's,
  // except mid-drag.
  useEffect(() => {
    if (row.active.value === null)
      row.order.value = keySignature ? keySignature.split('\n') : []
  }, [keySignature, row.active, row.order])

  // Written whole, since chips measure in the same frame, and together with
  // `placed` so chips leave the normal row only once their slots are right.
  useEffect(() => {
    const next = Object.fromEntries(
      Object.entries(sizes).map(([key, size]) => [key, size.width])
    )
    scheduleOnUI(() => {
      'worklet'
      widths.value = next
      if (measured) placed.value = true
    })
  }, [sizes, measured, widths, placed])

  const measure = (key: string, size: Size) => {
    setSizes((current) =>
      current[key]?.width === size.width && current[key]?.height === size.height
        ? current
        : { ...current, [key]: size }
    )
  }

  const autoScroll = useFrameCallback((frame) => {
    const key = row.active.value
    if (key === null) return
    const left = rowStart.value + row.dragLeft.value - row.scroll.value
    const right = left + (row.widths.value[key] ?? 0)
    const edge = viewportWidth.value - EDGE
    const overflow = left < EDGE ? left - EDGE : right > edge ? right - edge : 0
    if (overflow === 0) return
    const speed = MAX_SCROLL_SPEED * Math.max(-1, Math.min(1, overflow / EDGE))
    const maxScroll = Math.max(0, contentWidth.value - viewportWidth.value)
    const scroll = Math.max(
      0,
      Math.min(
        maxScroll,
        row.scroll.value + (speed * (frame.timeSincePreviousFrame ?? 16)) / 1000
      )
    )
    if (scroll === row.scroll.value) return
    row.scroll.value = scroll
    scrollTo(scrollRef, scroll, 0, false)
    follow(row, key)
  }, false)

  const dragStarted = () => {
    autoScroll.setActive(true)
    void Haptics.medium()
  }

  const dragEnded = (next: readonly string[], changed: boolean) => {
    autoScroll.setActive(false)
    if (!changed) return
    const byKey = new Map(data.map((item) => [keyExtractor(item), item]))
    onReorder(next.flatMap((key) => byKey.get(key) ?? []))
  }

  // Sized by hand once chips are placed, which takes them out of the flow.
  const measuredKeys = keys.filter((key) => key in sizes)
  const placedStyle = measured
    ? {
        width: rowLength(
          measuredKeys,
          Object.fromEntries(
            measuredKeys.map((key) => [key, sizes[key].width])
          ),
          GAP
        ),
        height: Math.max(0, ...measuredKeys.map((key) => sizes[key].height)),
      }
    : null

  return (
    <Animated.ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps='handled'
      onLayout={(e) => {
        viewportWidth.value = e.nativeEvent.layout.width
      }}
      onContentSizeChange={(width) => {
        contentWidth.value = width
      }}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{
        paddingHorizontal: 12,
        gap: GAP,
        alignItems: 'center',
      }}
    >
      {leading}
      <Animated.View
        onLayout={(e) => {
          rowStart.value = e.nativeEvent.layout.x
        }}
        style={[{ flexDirection: 'row', gap: GAP }, placedStyle]}
      >
        {data.map((item) => {
          const key = keyExtractor(item)
          return (
            <SortableChip
              key={key}
              itemKey={key}
              row={row}
              enabled={sortEnabled && measured && keys.length > 1}
              longPressMenus={longPressMenus}
              scrollOffset={scrollOffset}
              onMeasure={measure}
              onDragStarted={dragStarted}
              onDragEnded={dragEnded}
              onOrderChanged={() => void Haptics.selection()}
            >
              {renderItem(item)}
            </SortableChip>
          )
        })}
      </Animated.View>
      {trailing}
    </Animated.ScrollView>
  )
}

/**
 * Keeps the dragged chip under the finger as the finger or the row moves, and
 * moves it past the neighbors it crosses. Returns whether the order changed.
 */
function follow(row: RowState, key: string): boolean {
  'worklet'
  const { left, scroll } = row.start.value
  row.dragLeft.value = left + row.travel.value + (row.scroll.value - scroll)
  const next = reorderForDrag(
    row.order.value,
    key,
    row.dragLeft.value,
    row.widths.value,
    GAP
  )
  if (next === row.order.value) return false
  row.order.value = next
  return true
}

function SortableChip({
  itemKey: key,
  row,
  enabled,
  longPressMenus,
  scrollOffset,
  onMeasure,
  onDragStarted,
  onDragEnded,
  onOrderChanged,
  children,
}: {
  itemKey: string
  row: RowState
  enabled: boolean
  longPressMenus: boolean
  scrollOffset: SharedValue<number>
  onMeasure: (key: string, size: Size) => void
  onDragStarted: () => void
  onDragEnded: (order: readonly string[], changed: boolean) => void
  onOrderChanged: () => void
  children: ReactElement
}) {
  /** Left edge while sliding to a new slot; otherwise the chip sits at it. */
  const x = useSharedValue(0)
  const sliding = useSharedValue(false)
  const touch = useSharedValue({ x: 0, y: 0, at: 0, pointer: false })
  const orderAtStart = useSharedValue<readonly string[]>([])
  const lift = useDerivedValue(() =>
    withTiming(row.active.value === key ? 1 : 0, SETTLE)
  )

  // Slides aside while another chip is dragged past, and into its slot when
  // dropped. Any other change (measuring, a chip added or removed) jumps.
  useAnimatedReaction(
    () => [row.slots.value[key], row.active.value] as const,
    ([slot, active], previous) => {
      if (slot === undefined || active === key || !previous) return
      const [previousSlot, previousActive] = previous
      let from: number
      if (previousActive === key) from = row.dragLeft.value
      else if (
        active !== null &&
        previousSlot !== undefined &&
        previousSlot !== slot
      )
        from = sliding.value ? x.value : previousSlot
      else return
      x.value = from
      sliding.value = true
      x.value = withTiming(slot, SETTLE, (finished) => {
        if (finished) sliding.value = false
      })
    }
  )

  const style = useAnimatedStyle(() => {
    if (!row.placed.value) return {}
    const slot = row.slots.value[key]
    const active = row.active.value === key
    return {
      position: 'absolute',
      left: 0,
      opacity: active || slot !== undefined ? 1 : 0,
      zIndex: lift.value > 0 ? 1 : 0,
      transform: [
        {
          translateX: active
            ? row.dragLeft.value
            : sliding.value
              ? x.value
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
      if (!point || e.numberOfTouches > 1 || row.active.value !== null) {
        manager.fail()
        return
      }
      touch.value = {
        x: point.absoluteX,
        y: point.absoluteY,
        at: Date.now(),
        pointer: e.pointerType === PointerType.MOUSE,
      }
    })
    .onTouchesMove((e, manager) => {
      const point = e.allTouches[0]
      if (!point) return
      const start = touch.value
      if (row.active.value === key) {
        row.travel.value = point.absoluteX - start.x
        if (follow(row, key)) scheduleOnRN(onOrderChanged)
        return
      }
      const moved = Math.hypot(
        point.absoluteX - start.x,
        point.absoluteY - start.y
      )
      if (moved < SLOP) return
      const held = Date.now() - start.at
      const slot = row.slots.value[key]
      if (
        slot === undefined ||
        (!start.pointer &&
          (held < HOLD_MS || (longPressMenus && held > MENU_MS)))
      ) {
        manager.fail()
        return
      }
      row.scroll.value = scrollOffset.value
      row.start.value = { left: slot, scroll: scrollOffset.value }
      row.travel.value = point.absoluteX - start.x
      row.dragLeft.value = slot + row.travel.value
      orderAtStart.value = row.order.value
      row.active.value = key
      manager.activate()
      scheduleOnRN(onDragStarted)
    })
    .onTouchesUp((_e, manager) => manager.end())
    .onTouchesCancelled((_e, manager) => manager.fail())
    .onFinalize(() => {
      if (row.active.value !== key) return
      const order = row.order.value
      row.active.value = null
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
          const { width, height } = e.nativeEvent.layout
          onMeasure(key, { width, height })
        }}
        style={style}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  )
}
