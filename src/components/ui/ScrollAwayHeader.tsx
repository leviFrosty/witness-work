import { PropsWithChildren, useState } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'

/** Matches the tab bar, so header and bar leave and return together. */
export const BARS_TRANSITION_MS = 260

type Props = PropsWithChildren<{
  /** From `useHideBarsOnScroll`. */
  hidden: boolean
  /** Fills the status bar's strip while the header is away. */
  backgroundColor?: string
  /**
   * Floats the header over the scroll view instead of pushing it down. Pad the
   * content's top by `onHeightChange`'s height and it scrolls under the header,
   * so hiding never resizes the scroll view: a resize at the top or bottom edge
   * fights the scroll's bounce and makes the content jitter. The header needs
   * an opaque background.
   */
  overlay?: boolean
  onHeightChange?: (height: number) => void
}>

/**
 * A root header that slides up under the status bar while `hidden`, and the
 * content below it rises into the room it leaves (or, as an `overlay`, was
 * already under it). Its natural height is left alone while it shows, so a
 * header that resizes itself (e.g. compacting) still animates on its own.
 */
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
  // Everything but the status bar's strip, which stays clear of the content.
  const travel = Math.max(0, height - insets.top)
  const duration = reduceMotion ? 0 : BARS_TRANSITION_MS

  return (
    <Animated.View
      pointerEvents='box-none'
      style={
        overlay
          ? styles.overlay
          : {
              // Pulls whatever follows up into the room the header leaves.
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
      {/* Covers the header as it passes under the status bar. Clear while
      the header shows, so a translucent one (over the map) stays that way. */}
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
            // Held until the returning header is out from under it.
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
