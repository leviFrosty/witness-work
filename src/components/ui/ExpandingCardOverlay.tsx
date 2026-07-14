import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Pressable, StatusBar, useWindowDimensions, View } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { FullWindowOverlay } from 'react-native-screens'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import useTheme from '@/contexts/theme'

export type ExpandingCardOrigin = {
  x: number
  y: number
  width: number
  height: number
}

type Props = {
  origin: ExpandingCardOrigin | null
  open: boolean
  onClose: () => void
  children: ReactNode
  expandedHeight?: number
}

const MORPH_SPRING = { damping: 20, stiffness: 180, mass: 0.7 }
const EXPANDED_MARGIN = 16

/**
 * Morphs a measured card into the centered modal treatment used by Schedule
 * insights. The origin remains mounted during close so the card can animate
 * cleanly back into place.
 */
const ExpandingCardOverlay = ({
  origin,
  open,
  onClose,
  children,
  expandedHeight = 310,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const progress = useSharedValue(0)

  const targetWidth = windowWidth - EXPANDED_MARGIN * 2
  const targetHeight = Math.min(
    expandedHeight,
    windowHeight - insets.top - insets.bottom - EXPANDED_MARGIN * 2
  )
  const targetX = EXPANDED_MARGIN
  const targetY = Math.max(
    insets.top + EXPANDED_MARGIN,
    (windowHeight - targetHeight) / 2
  )

  useEffect(() => {
    if (!origin) return
    progress.value = withSpring(open ? 1 : 0, MORPH_SPRING)
  }, [open, origin, progress])

  const containerStyle = useAnimatedStyle(() => {
    if (!origin) return {}
    return {
      left: interpolate(progress.value, [0, 1], [origin.x, targetX]),
      top: interpolate(progress.value, [0, 1], [origin.y, targetY]),
      width: interpolate(progress.value, [0, 1], [origin.width, targetWidth]),
      height: interpolate(
        progress.value,
        [0, 1],
        [origin.height, targetHeight]
      ),
      borderRadius: theme.numbers.borderRadiusLg,
    }
  })

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.5]),
  }))
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 1], [0, 1], 'clamp'),
  }))
  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.15], [0, 1], 'clamp'),
  }))

  if (!origin) return null

  return (
    <FullWindowOverlay>
      {open ? <StatusBar barStyle='light-content' animated /> : null}
      <View
        pointerEvents={open ? 'auto' : 'none'}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        style={{ flex: 1 }}
      >
        <Pressable onPress={onClose} style={{ flex: 1 }}>
          <Animated.View
            style={[{ flex: 1, backgroundColor: '#000' }, backdropStyle]}
          />
        </Pressable>
        <Animated.View
          style={[{ position: 'absolute', overflow: 'hidden' }, containerStyle]}
        >
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: targetWidth,
                height: targetHeight,
                backgroundColor: theme.colors.card,
              },
              surfaceStyle,
            ]}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: targetWidth,
                height: targetHeight,
                padding: 20,
                gap: 18,
              },
              contentStyle,
            ]}
          >
            {children}
          </Animated.View>
        </Animated.View>
      </View>
    </FullWindowOverlay>
  )
}

export default ExpandingCardOverlay
