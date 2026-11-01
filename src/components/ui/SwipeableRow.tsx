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
  renderLeadingActions?: RenderActions

  renderTrailingActions?: RenderActions
  onSwipeableOpen?: (side: SwipeSide, swipeable: SwipeableMethods) => void
  onSwipeableWillOpen?: (side: SwipeSide) => void
}

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
