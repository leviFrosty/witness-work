import {
  type ReactNode,
  type Ref,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  type AccessibilityActionInfo,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'
import { Gesture } from 'react-native-gesture-handler'
import Animated, { LinearTransition } from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import {
  ReorderableContext,
  type ReorderableEntry,
  ReorderableItemContext,
} from '@/components/ui/reorderable/context'
import Jiggle from '@/components/ui/reorderable/Jiggle'
import RemoveBadge from '@/components/ui/reorderable/RemoveBadge'
import ResizeHandle from '@/components/ui/reorderable/ResizeHandle'
import { LIFT_DELAY_MS } from '@/components/ui/reorderable/ReorderableContainer'
import LiftDetector from '@/components/ui/reorderable/LiftDetector'
import {
  type ReorderableSizeOption,
  resizeAccessories,
  snapResize,
} from '@/components/ui/reorderable/resizeSnap'

export type { ReorderableSizeOption }

export type ReorderableResize<Size extends string> = {
  size: Size
  /** Smallest first. */
  options: ReorderableSizeOption<Size>[]
  onResize: (size: Size) => void
  /** E.g. "Resize Daily Pace". */
  label: string
}

type Props<Size extends string> = {
  id: string
  children: ReactNode
  /** The cell around the item, e.g. its width in a grid. */
  style?: StyleProp<ViewStyle>
  /** Stretch to the cell's height, as an item beside a taller one does. */
  fill?: boolean
  /** The item's corner radius, for the badge and the resize handle. */
  radius?: number
  /** Can be dragged to another place (default true). */
  movable?: boolean
  /** Rests, dimmed, while editing: not moved, removed or moved onto. */
  locked?: boolean
  /**
   * Holding it outside edit mode starts editing with it lifted (default true,
   * when the container has `onLiftToEdit`). `zone` lifts only from a
   * `ReorderableLiftZone` inside it, for items full of rows with menus of their
   * own. Turn it off for items whose own long press opens a menu.
   */
  liftOutsideEditing?: boolean | 'zone'
  onRemove?: () => void
  /** E.g. "Remove Daily Pace". */
  removeLabel?: string
  resize?: ReorderableResize<Size>
  /** While editing, the item is one element with these. */
  accessibilityLabel?: string
  accessibilityActions?: AccessibilityActionInfo[]
  onAccessibilityAction?: (name: string) => void
  /** The cell, e.g. to measure where the item is. */
  viewRef?: Ref<View>
  /**
   * The space the layout puts between items (a column's `gap`). Content that
   * draws nothing (a section with nothing to show today) gives it back, so the
   * item leaves no hole.
   */
  gap?: number
  /**
   * Shown while editing in place of content that draws nothing, so the item can
   * still be moved or removed.
   */
  emptyPlaceholder?: ReactNode
}

/**
 * One rearrangeable thing inside a `ReorderableContainer`: a card, a section.
 * While the container is editing it jiggles; a gray minus at its top leading
 * corner removes it (`onRemove`) and a curved handle at its bottom trailing
 * corner resizes it (`resize`), as on Home Screen widgets. Only give it the
 * sizes that make sense; without `resize` it has no handle.
 */
export default function ReorderableItem<Size extends string>({
  id,
  children,
  style,
  fill = false,
  radius,
  movable = true,
  locked = false,
  liftOutsideEditing = true,
  onRemove,
  removeLabel,
  resize,
  accessibilityLabel,
  accessibilityActions,
  onAccessibilityAction,
  viewRef,
  gap = 0,
  emptyPlaceholder,
}: Props<Size>) {
  const theme = useTheme()
  const container = useContext(ReorderableContext)
  const contentRef = useRef<View>(null)
  const cornerRadius = radius ?? theme.numbers.borderRadiusLg
  const editing = container?.editing ?? false
  const dragged = container?.draggedId === id
  const resizing = container?.resizingId === id
  const [empty, setEmpty] = useState(false)
  const [boxTop, setBoxTop] = useState(0)
  const placeholder = empty && editing ? emptyPlaceholder : null
  const collapsed = empty && !placeholder
  const showChrome = editing && !locked && !dragged && !collapsed

  const entry = useRef<ReorderableEntry>({
    rect: null,
    render: () => null,
    movable,
    locked,
    removable: false,
    resizable: false,
    radius: cornerRadius,
    boxTop: 0,
    measure: () => {},
  })

  const measure = () => {
    const content = contentRef.current
    const root = container?.containerRef.current
    if (!content || !root) return
    content.measureLayout(
      root,
      (x, y, width, height) => {
        const last = entry.current.rect
        if (
          last &&
          last.x === x &&
          last.y === y &&
          last.width === width &&
          last.height === height
        ) {
          return
        }
        entry.current.rect = { x, y, width, height }
        container?.measured(id)
      },
      () => {}
    )
  }

  // Kept current after every render: the container reads it in gestures.
  useEffect(() => {
    Object.assign(entry.current, {
      render: () => (
        <>
          {children}
          {placeholder}
        </>
      ),
      movable,
      locked,
      removable: !!onRemove,
      resizable: !!resize && resize.options.length > 1,
      radius: cornerRadius,
      boxTop,
      measure,
    })
    container?.changed()
  })

  const register = container?.register
  useEffect(() => register?.(id, entry.current), [register, id])

  // The resize in progress: the frame and size it started from.
  const resizeStart = useRef<{
    width: number
    height: number
    size: Size
  } | null>(null)
  const latestResize = useRef(resize)
  useEffect(() => {
    latestResize.current = resize
  })

  const onResizeBegin = () => {
    const rect = entry.current.rect
    if (!rect || !resize) return
    resizeStart.current = {
      width: rect.width,
      height: rect.height,
      size: resize.size,
    }
    container?.setResizing(id)
  }

  const onResizeDrag = (forward: number, down: number) => {
    const start = resizeStart.current
    const current = latestResize.current
    if (!start || !current) return
    const next = snapResize({
      options: current.options,
      current: current.size,
      start,
      forward,
      down,
    })
    if (next === current.size) return
    Haptics.selection()
    current.onResize(next)
  }

  const onResizeEnd = (tapped: boolean) => {
    resizeStart.current = null
    container?.setResizing(null)
    const current = latestResize.current
    if (!tapped || !current) return
    const at = current.options.findIndex(
      (option) => option.size === current.size
    )
    Haptics.light()
    current.onResize(current.options[(at + 1) % current.options.length].size)
  }

  // Outside edit mode the item lifts with its own gesture (the container's
  // runs only while editing). It stays on through the drag it started, which
  // starts editing.
  const lift = container?.lift
  const liftGesture = () =>
    !container?.canLiftToEdit || locked || !lift
      ? null
      : Gesture.Pan()
          .enabled(!editing || dragged)
          .activateAfterLongPress(LIFT_DELAY_MS)
          .maxPointers(1)
          .runOnJS(true)
          .onBegin(lift.begin)
          .onStart((e) => lift.start(id, e))
          .onUpdate(lift.move)
          .onFinalize(lift.end)
  const ownLift = liftOutsideEditing === true ? liftGesture() : null

  return (
    <Animated.View
      ref={viewRef}
      layout={editing ? LinearTransition.duration(200) : undefined}
      onLayout={measure}
      style={[style, collapsed && gap ? { marginTop: -gap } : null]}
    >
      <ReorderableItemContext.Provider
        value={{
          liftGesture,
          liftLost: () => lift?.lost(id),
          measureBox: (box) => {
            const content = contentRef.current
            if (!content) return
            box.measureLayout(
              content,
              (_x, y) => setBoxTop(y),
              () => {}
            )
          },
        }}
      >
        <Jiggle
          active={editing && !locked && !dragged && !resizing && !collapsed}
          style={[
            fill && { flex: 1 },
            editing && locked ? { opacity: 0.4 } : null,
          ]}
        >
          <LiftDetector gesture={ownLift} onUnmount={() => lift?.lost(id)}>
            <View
              ref={contentRef}
              collapsable={false}
              onLayout={measure}
              pointerEvents={editing ? (locked ? 'none' : 'box-only') : 'auto'}
              accessible={editing && !locked ? true : undefined}
              accessibilityLabel={editing ? accessibilityLabel : undefined}
              accessibilityActions={editing ? accessibilityActions : undefined}
              onAccessibilityAction={(e) =>
                onAccessibilityAction?.(e.nativeEvent.actionName)
              }
              style={[fill && { flex: 1 }, { opacity: dragged ? 0 : 1 }]}
            >
              <View
                style={fill ? { flex: 1 } : undefined}
                onLayout={(e) => setEmpty(e.nativeEvent.layout.height === 0)}
              >
                {children}
              </View>
              {placeholder}
            </View>
          </LiftDetector>
          {showChrome && onRemove ? (
            <RemoveBadge
              label={removeLabel ?? ''}
              top={boxTop}
              radius={cornerRadius}
              onPress={() => {
                Haptics.light()
                onRemove()
              }}
            />
          ) : null}
          {showChrome && resize && resize.options.length > 1 ? (
            <ResizeHandle
              label={resize.label}
              accessories={resizeAccessories(resize.options)}
              onBegin={onResizeBegin}
              onDrag={onResizeDrag}
              onEnd={onResizeEnd}
            />
          ) : null}
        </Jiggle>
      </ReorderableItemContext.Provider>
    </Animated.View>
  )
}
