import { forwardRef } from 'react'
import { Swipeable, type SwipeableProps } from 'react-native-gesture-handler'
import { isRtlLayout } from '@/lib/direction'

/** A row edge in reading order: leading is left in LTR and right in RTL. */
export type SwipeSide = 'leading' | 'trailing'

type RenderActions = SwipeableProps['renderLeftActions']

export type SwipeableRowProps = Omit<
  SwipeableProps,
  | 'renderLeftActions'
  | 'renderRightActions'
  | 'onSwipeableOpen'
  | 'onSwipeableWillOpen'
  | 'onSwipeableLeftOpen'
  | 'onSwipeableRightOpen'
  | 'onSwipeableLeftWillOpen'
  | 'onSwipeableRightWillOpen'
> & {
  /** Revealed on the leading edge, by swiping toward the trailing edge. */
  renderLeadingActions?: RenderActions
  /** Revealed on the trailing edge, by swiping toward the leading edge. */
  renderTrailingActions?: RenderActions
  onSwipeableOpen?: (side: SwipeSide, swipeable: Swipeable) => void
  onSwipeableWillOpen?: (side: SwipeSide) => void
}

/**
 * Gesture-handler's `Swipeable` with actions on logical edges. Its own left and
 * right are physical, so in RTL the leading actions (Mail's "swipe right to
 * mark read") would stay on the left; this puts them on the right, as iOS
 * does.
 */
const SwipeableRow = forwardRef<Swipeable, SwipeableRowProps>(
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
    const rtl = isRtlLayout()
    const side = (direction: 'left' | 'right'): SwipeSide =>
      (direction === 'left') !== rtl ? 'leading' : 'trailing'
    return (
      <Swipeable
        ref={ref}
        {...props}
        renderLeftActions={rtl ? renderTrailingActions : renderLeadingActions}
        renderRightActions={rtl ? renderLeadingActions : renderTrailingActions}
        onSwipeableOpen={
          onSwipeableOpen &&
          ((direction, swipeable) =>
            onSwipeableOpen(side(direction), swipeable))
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

export type { Swipeable }
export default SwipeableRow
