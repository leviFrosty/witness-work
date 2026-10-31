import { forwardRef, useImperativeHandle } from 'react'
import { View } from 'react-native'
import type { LottieViewProps } from 'lottie-react-native'

/**
 * Stands in for lottie-react-native in the web build (see
 * `metro/bundleRedirects.js`). Its web build plays through dotLottie, whose
 * renderer downloads WebAssembly from a third-party CDN, which the web app
 * never loads (ADR 0037 §5). This keeps the animation's space and plays
 * nothing: a play finishes at once, so whatever waits for the end moves on.
 */
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
