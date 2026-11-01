import { PropsWithChildren, useState } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'

export const BARS_TRANSITION_MS = 260

type Props = PropsWithChildren<{
  hidden: boolean

  backgroundColor?: string

  overlay?: boolean
  onHeightChange?: (height: number) => void
}>

export default function ScrollAwayHeader({
  hidden,
  backgroundColor,
  overlay = false,
  onHeightChange,
  children,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const [height, setHeight] = useState(0)

  const travel = Math.max(0, height - insets.top)
  const duration = reduceMotion ? 0 : BARS_TRANSITION_MS

  return (
    <Animated.View
      pointerEvents='box-none'
      style={
        overlay
          ? styles.overlay
          : {
              marginBottom: hidden ? -travel : 0,
              transitionProperty: 'marginBottom',
              transitionDuration: duration,
              transitionTimingFunction: 'ease-in-out',
            }
      }
    >
      <Animated.View
        onLayout={(e) => {
          setHeight(e.nativeEvent.layout.height)
          onHeightChange?.(e.nativeEvent.layout.height)
        }}
        pointerEvents={hidden ? 'none' : 'box-none'}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        style={{
          opacity: hidden ? 0 : 1,
          transform: [{ translateY: hidden ? -travel : 0 }],
          transitionProperty: ['opacity', 'transform'],
          transitionDuration: duration,
          transitionTimingFunction: 'ease-in-out',
        }}
      >
        {children}
      </Animated.View>
      {}
      <Animated.View
        pointerEvents='none'
        style={[
          styles.statusBarStrip,
          {
            height: insets.top,
            backgroundColor: backgroundColor ?? theme.colors.background,
            opacity: hidden ? 1 : 0,
            transitionProperty: 'opacity',
            transitionDuration: hidden ? 0 : duration / 2,

            transitionDelay: hidden ? 0 : duration,
          },
        ]}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  statusBarStrip: { position: 'absolute', top: 0, left: 0, right: 0 },
})
