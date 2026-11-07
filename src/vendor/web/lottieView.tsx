import { forwardRef, useImperativeHandle } from 'react'
import { View } from 'react-native'
import type { LottieViewProps } from 'lottie-react-native'

const LottieView = forwardRef<unknown, LottieViewProps>(function LottieView(
  { style, testID, onAnimationFinish },
  ref
) {
  useImperativeHandle(ref, () => ({
    play: () => setTimeout(() => onAnimationFinish?.(false)),
    reset: () => {},
    pause: () => {},
    resume: () => {},
  }))
  return <View style={style} testID={testID} />
})

export default LottieView
