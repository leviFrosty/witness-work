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

  enabled?: boolean
}

const SwipeMonthNavigator = ({
  onSwipeForward,
  onSwipeBack,
  children,
  style,
  enabled = true,
}: SwipeMonthNavigatorProps) => {
  const rtl = isRtlLayout()
  const flingForward = Gesture.Fling()
    .enabled(enabled)
    .direction(rtl ? Directions.RIGHT : Directions.LEFT)
    .runOnJS(true)
    .onEnd(() => {
      Haptics.light()
      onSwipeForward()
    })

  const flingBack = Gesture.Fling()
    .enabled(enabled)
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
