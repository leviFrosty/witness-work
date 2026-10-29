import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react'
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'
import Swipeable, {
  SwipeDirection,
  type SwipeableMethods,
  type SwipeableProps,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import { isRtlLayout } from '@/lib/direction'

/** A row edge in reading order: leading is left in LTR and right in RTL. */
export type SwipeSide = 'leading' | 'trailing'

type RenderActions = SwipeableProps['renderLeftActions']

export type SwipeableRowProps = Omit<
  SwipeableProps,
  | 'ref'
  | 'renderLeftActions'
  | 'renderRightActions'
  | 'onSwipeableOpen'
  | 'onSwipeableWillOpen'
> & {
  /** Revealed on the leading edge, by swiping toward the trailing edge. */
  renderLeadingActions?: RenderActions
  /** Revealed on the trailing edge, by swiping toward the leading edge. */
  renderTrailingActions?: RenderActions
  onSwipeableOpen?: (side: SwipeSide, swipeable: SwipeableMethods) => void
  onSwipeableWillOpen?: (side: SwipeSide) => void
}

/**
 * `Swipeable` keeps the actions under the row while it's closed, so a row with
 * a see-through background (a selected contact's tint) would show them; they
 * appear only once the row moves.
 *
 * Swipe actions are a gesture shortcut for actions each row's menu also offers,
 * where screen readers reach them. VoiceOver would still read their labels
 * after every row, so they stay out of the accessibility tree. The row keeps
 * their layout: they still stretch to the row's height.
 */
function SwipeActions({
  progress,
  children,
}: {
  progress: SharedValue<number>
  children: ReactNode
}) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value > 0 ? 1 : 0,
  }))
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={[{ flexDirection: 'row' }, style]}
    >
      {children}
    </Animated.View>
  )
}

const wrapActions =
  (render: RenderActions): RenderActions =>
  (progress, ...rest) => (
    <SwipeActions progress={progress}>
      {render?.(progress, ...rest)}
    </SwipeActions>
  )

/**
 * Gesture-handler's `Swipeable` with actions on logical edges. Its own left and
 * right are physical, so in RTL the leading actions (Mail's "swipe right to
 * mark read") would stay on the left; this puts them on the right, as iOS
 * does.
 */
const SwipeableRow = forwardRef<SwipeableMethods, SwipeableRowProps>(
  (
    {
      renderLeadingActions,
      renderTrailingActions,
      onSwipeableOpen,
      onSwipeableWillOpen,
      ...props
    },
    ref
  ) => {
    const swipeable = useRef<SwipeableMethods>(null)
    useImperativeHandle(ref, () => swipeable.current as SwipeableMethods)
    const rtl = isRtlLayout()
    const leading = renderLeadingActions && wrapActions(renderLeadingActions)
    const trailing = renderTrailingActions && wrapActions(renderTrailingActions)
    // The direction the row moved: right reveals the left actions.
    const side = (direction: SwipeDirection): SwipeSide =>
      (direction === SwipeDirection.RIGHT) !== rtl ? 'leading' : 'trailing'
    return (
      <Swipeable
        ref={swipeable}
        {...props}
        renderLeftActions={rtl ? trailing : leading}
        renderRightActions={rtl ? leading : trailing}
        onSwipeableOpen={
          onSwipeableOpen &&
          ((direction) => {
            if (swipeable.current)
              onSwipeableOpen(side(direction), swipeable.current)
          })
        }
        onSwipeableWillOpen={
          onSwipeableWillOpen &&
          ((direction) => onSwipeableWillOpen(side(direction)))
        }
      />
    )
  }
)
SwipeableRow.displayName = 'SwipeableRow'

export type { SwipeableMethods as Swipeable }
export default SwipeableRow
