import { ReactNode } from 'react'
import { View, ViewStyle } from 'react-native'
import {
  Directions,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler'

import Haptics from '@/lib/haptics'
import { isRtlLayout } from '@/lib/direction'

interface SwipeMonthNavigatorProps {
  onSwipeForward: () => void
  onSwipeBack: () => void
  children: ReactNode
  style?: ViewStyle
}

/**
 * Detects a horizontal fling and calls forward/back so users can swipe to
 * change months. Fling (not Pan) avoids fighting child Swipeables and vertical
 * scroll — it only fires on a quick flick. Flicking toward the reading start
 * (left in LTR, right in RTL) brings the next month in from the end.
 */
const SwipeMonthNavigator = ({
  onSwipeForward,
  onSwipeBack,
  children,
  style,
}: SwipeMonthNavigatorProps) => {
  const rtl = isRtlLayout()
  const flingForward = Gesture.Fling()
    .direction(rtl ? Directions.RIGHT : Directions.LEFT)
    .runOnJS(true)
    .onEnd(() => {
      Haptics.light()
      onSwipeForward()
    })

  const flingBack = Gesture.Fling()
    .direction(rtl ? Directions.LEFT : Directions.RIGHT)
    .runOnJS(true)
    .onEnd(() => {
      Haptics.light()
      onSwipeBack()
    })

  const gesture = Gesture.Race(flingForward, flingBack)

  return (
    <GestureDetector gesture={gesture}>
      <View style={style}>{children}</View>
    </GestureDetector>
  )
}

export default SwipeMonthNavigator
