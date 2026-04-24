// Vendored from react-native-confetti-cannon (MIT, (c) 2019 Vincent Catillon).
// See ./LICENSE. Ported from Flow to TypeScript.

import * as React from 'react'
import { StyleSheet, Animated } from 'react-native'

import { randomValue } from './utils'

type Interpolation = Animated.AnimatedInterpolation<number | string>

type TransformEntry = {
  translateX?: Interpolation
  translateY?: Interpolation
  rotate?: Interpolation
  rotateX?: Interpolation
  rotateY?: Interpolation
  perspective?: number
}

type Props = {
  containerTransform: TransformEntry[]
  transform: TransformEntry[]
  color: string
  opacity: Interpolation
  testID?: string
}

class Confetti extends React.PureComponent<Props> {
  width: number = randomValue(8, 16)
  height: number = randomValue(6, 12)
  isRounded: boolean = Math.round(randomValue(0, 1)) === 1

  render() {
    const { containerTransform, transform, opacity, color, testID } = this.props
    const { width, height, isRounded } = this
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const containerStyle: any = { transform: containerTransform }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const style: any = {
      width,
      height,
      backgroundColor: color,
      transform,
      opacity,
    }

    return (
      <Animated.View
        testID={testID}
        pointerEvents='none'
        renderToHardwareTextureAndroid
        style={[styles.confetti, containerStyle]}
      >
        <Animated.View style={[isRounded && styles.rounded, style]} />
      </Animated.View>
    )
  }
}

const styles = StyleSheet.create({
  confetti: {
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
  rounded: {
    borderRadius: 100,
  },
})

export default Confetti
