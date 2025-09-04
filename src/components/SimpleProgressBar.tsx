import { View, Animated } from 'react-native'
import { useEffect, useRef, useState } from 'react'
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
  const [shimmerContainerWidth, setShimmerContainerWidth] = useState<number>(0)

  const progressColor = color ?? theme.colors.accent
  const barHeight = height
  const progressWidth = Math.min(percentage, 1.0) * 100

  useEffect(() => {
    if (
      !animated ||
      Math.min(percentage, 1.0) === 0 ||
      shimmerContainerWidth === 0
    ) {
      // Stop animation if not animated, no progress, or no measurement yet
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
          // Add a small pause at the end
          Animated.delay(300),
          // Instant reset to avoid jarring flash
          Animated.timing(pulseAnimation, {
            toValue: 0,
            duration: 0, // Instant reset - no visible movement
            useNativeDriver: true,
          }),
          // Small pause before next pulse
          Animated.delay(200),
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
  }, [
    animated,
    percentage,
    pulseDuration,
    pulseAnimation,
    shimmerContainerWidth,
  ])

  // Calculate pulse position dynamically based on shimmer container width
  // The shimmer should travel across the entire shimmer container (which is already the filled portion)
  const pulseTranslateX = pulseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [
      -60, // Start hidden to the left
      Math.max(200, shimmerContainerWidth + 60), // End past the shimmer container
    ],
  })

  return (
    <View
      style={{
        backgroundColor: theme.colors.background,
        overflow: 'visible',
        position: 'relative',
        borderRadius: theme.numbers.borderRadiusSm,
        width: width ?? '100%',
      }}
    >
      {/* External glow overlay (behind, not clipped) */}
      <View
        pointerEvents='none'
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: barHeight,
          width: `${progressWidth}%`,
          borderRadius: theme.numbers.borderRadiusSm,
          backgroundColor: progressColor,
          shadowColor: progressColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: animated && Math.min(percentage, 1.0) > 0 ? 0.8 : 0,
          shadowRadius: 12,
          elevation: animated && Math.min(percentage, 1.0) > 0 ? 10 : 0,
        }}
      />
      <View
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: theme.numbers.borderRadiusSm,
        }}
      >
        {/* Progress bar (clipped) */}
        <View
          style={{
            backgroundColor: progressColor,
            height: barHeight,
            width: `${progressWidth}%`,
            borderRadius: theme.numbers.borderRadiusSm,
          }}
        />

        {/* Pulse/Shimmer overlay - only visible when animated and has progress */}
        {animated && Math.min(percentage, 1.0) > 0 && (
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
            onLayout={(event) => {
              const { width: layoutWidth } = event.nativeEvent.layout
              setShimmerContainerWidth(layoutWidth)
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
