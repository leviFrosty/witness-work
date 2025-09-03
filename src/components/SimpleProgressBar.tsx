import { View, Animated } from 'react-native'
import { useEffect, useRef } from 'react'
import useTheme from '../contexts/theme'

interface SimpleProgressBarProps {
  /**
   * Provide a number between 0 and 1.
   *
   * @example
   *   // To display 25%
   *   0.25
   */
  percentage: number
  color?: string
  height?: number
  width?: number
  /**
   * Enable pulse/shimmer/glow animation effects
   *
   * @default true
   */
  animated?: boolean
  /**
   * Duration of pulse animation in milliseconds
   *
   * @default 2000
   */
  pulseDuration?: number
}

const SimpleProgressBar = ({
  percentage,
  color,
  height = 20,
  width,
  animated = true,
  pulseDuration = 2000,
}: SimpleProgressBarProps) => {
  const theme = useTheme()
  const pulseAnimation = useRef(new Animated.Value(0)).current
  const animationRef = useRef<Animated.CompositeAnimation | null>(null)

  const progressColor = color ?? theme.colors.accent
  const barHeight = height
  const progressWidth = percentage * 100

  useEffect(() => {
    if (!animated || percentage === 0) {
      // Stop animation if not animated or no progress
      if (animationRef.current) {
        animationRef.current.stop()
        animationRef.current = null
      }
      pulseAnimation.setValue(0)
      return
    }

    // Create pulse animation that moves from left to right
    const createPulseAnimation = () => {
      pulseAnimation.setValue(0)

      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: pulseDuration,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 0,
            duration: 200, // Quick reset
            useNativeDriver: true,
          }),
        ]),
        { iterations: -1 }
      )

      return animation
    }

    // Stop existing animation
    if (animationRef.current) {
      animationRef.current.stop()
    }

    // Start new animation
    animationRef.current = createPulseAnimation()
    animationRef.current.start()

    // Cleanup on unmount or dependency change
    return () => {
      if (animationRef.current) {
        animationRef.current.stop()
        animationRef.current = null
      }
    }
  }, [animated, percentage, pulseDuration, pulseAnimation])

  // Calculate pulse position - use reasonable values that work for most sizes
  const pulseTranslateX = pulseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, 200], // Start hidden left, end well past typical progress bar
  })

  return (
    <View
      style={{
        backgroundColor: theme.colors.background,
        overflow: 'visible', // Changed to visible to allow glow overflow
        borderRadius: theme.numbers.borderRadiusSm,
        width: width ?? '100%',
      }}
    >
      <View
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: theme.numbers.borderRadiusSm,
        }}
      >
        {/* Progress bar with glow effect */}
        <View
          style={{
            backgroundColor: progressColor,
            height: barHeight,
            width: `${progressWidth}%`,
            borderRadius: theme.numbers.borderRadiusSm,
            // Glow effect using shadow
            shadowColor: progressColor,
            shadowOffset: {
              width: 0,
              height: 0,
            },
            shadowOpacity: animated && percentage > 0 ? 0.6 : 0,
            shadowRadius: 8,
            elevation: animated && percentage > 0 ? 8 : 0,
          }}
        />

        {/* Pulse/Shimmer overlay - only visible when animated and has progress */}
        {animated && percentage > 0 && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${progressWidth}%`, // Only cover the filled portion
              height: '100%',
              overflow: 'hidden',
              borderRadius: theme.numbers.borderRadiusSm,
            }}
          >
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                height: '100%',
                width: 60, // Fixed width shimmer that works with pixel-based transform
                transform: [{ translateX: pulseTranslateX }],
              }}
            >
              {/* Shimmer gradient effect using multiple overlays */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 40,
                  height: '100%',
                  backgroundColor: 'rgba(255, 255, 255, 0.4)',
                  transform: [{ skewX: '-20deg' }],
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 10,
                  width: 30,
                  height: '100%',
                  backgroundColor: 'rgba(255, 255, 255, 0.6)',
                  transform: [{ skewX: '-20deg' }],
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 20,
                  width: 15,
                  height: '100%',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  transform: [{ skewX: '-20deg' }],
                }}
              />
            </Animated.View>
          </View>
        )}
      </View>
    </View>
  )
}

export default SimpleProgressBar
