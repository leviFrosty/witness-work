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

  options: ReorderableSizeOption<Size>[]
  onResize: (size: Size) => void

  label: string
}

type Props<Size extends string> = {
  id: string
  children: ReactNode

  style?: StyleProp<ViewStyle>

  fill?: boolean

  radius?: number

  movable?: boolean

  locked?: boolean

  liftOutsideEditing?: boolean | 'zone'
  onRemove?: () => void

  removeLabel?: string
  resize?: ReorderableResize<Size>

  accessibilityLabel?: string
  accessibilityActions?: AccessibilityActionInfo[]
  onAccessibilityAction?: (name: string) => void

  viewRef?: Ref<View>

  gap?: number

  emptyPlaceholder?: ReactNode
}

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
