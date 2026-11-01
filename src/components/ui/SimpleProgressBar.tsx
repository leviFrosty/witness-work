import { View, Animated } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import useTheme from '@/contexts/theme'
import { forwardSign } from '@/lib/direction'

interface SimpleProgressBarProps {
  percentage: number
  color?: string
  height?: number
  width?: number

  animated?: boolean

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
      if (animationRef.current) {
        animationRef.current.stop()
        animationRef.current = null
      }
      pulseAnimation.setValue(0)
      return
    }

    const createPulseAnimation = () => {
      pulseAnimation.setValue(0)

      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: pulseDuration,
            useNativeDriver: true,
          }),

          Animated.delay(300),

          Animated.timing(pulseAnimation, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),

          Animated.delay(200),
        ]),
        { iterations: -1 }
      )

      return animation
    }

    if (animationRef.current) {
      animationRef.current.stop()
    }

    animationRef.current = createPulseAnimation()
    animationRef.current.start()

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

  const sign = forwardSign()
  const pulseTranslateX = pulseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [sign * -60, sign * Math.max(200, shimmerContainerWidth + 60)],
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
      {}
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
        {}
        <View
          style={{
            backgroundColor: progressColor,
            height: barHeight,
            width: `${progressWidth}%`,
            borderRadius: theme.numbers.borderRadiusSm,
          }}
        />

        {}
        {animated && Math.min(percentage, 1.0) > 0 && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${progressWidth}%`,
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
                width: 60,
                transform: [{ translateX: pulseTranslateX }],
              }}
            >
              {}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 40,
                  height: '100%',
                  backgroundColor: 'rgba(255, 255, 255, 0.4)',
                  transform: [{ skewX: `${sign * -20}deg` }],
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
                  transform: [{ skewX: `${sign * -20}deg` }],
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
                  transform: [{ skewX: `${sign * -20}deg` }],
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
