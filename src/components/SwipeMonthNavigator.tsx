import { ReactNode } from 'react'
import { View, ViewStyle } from 'react-native'
import {
  Directions,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler'

import Haptics from '../lib/haptics'

interface SwipeMonthNavigatorProps {
  onSwipeForward: () => void
  onSwipeBack: () => void
  children: ReactNode
  style?: ViewStyle
}

/**
 * Detects a horizontal fling and calls forward/back so users can swipe to
 * change months. Fling (not Pan) avoids fighting child Swipeables and vertical
 * scroll — it only fires on a quick flick.
 */
const SwipeMonthNavigator = ({
  onSwipeForward,
  onSwipeBack,
  children,
  style,
}: SwipeMonthNavigatorProps) => {
  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .runOnJS(true)
    .onEnd(() => {
      Haptics.light()
      onSwipeForward()
    })

  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .runOnJS(true)
    .onEnd(() => {
      Haptics.light()
      onSwipeBack()
    })

  const gesture = Gesture.Race(flingLeft, flingRight)

  return (
    <GestureDetector gesture={gesture}>
      <View style={style}>{children}</View>
    </GestureDetector>
  )
}

export default SwipeMonthNavigator
