import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import BadgeShine from '@/features/badges/components/BadgeShine'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'

type Entrance = 'tilt' | 'spring'

/**
 * A large medallion that arrives with a little life: `tilt` settles from a
 * slight turn (a badge's detail), `spring` pops in from small (a new badge).
 * Earned metal gets one light sweep. Still under Reduce Motion.
 */
export default function BadgeSpotlight({
  art,
  level,
  size,
  state = 'earned',
  entrance = 'tilt',
  delay = 0,
}: {
  art: BadgeArtId
  level: BadgeLevel | null
  size: number
  state?: 'earned' | 'locked'
  entrance?: Entrance
  delay?: number
}) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(reduceMotion ? 1 : 0)

  useEffect(() => {
    if (reduceMotion) return
    progress.value = withDelay(
      delay,
      entrance === 'spring'
        ? withSpring(1, { damping: 11, stiffness: 140, mass: 0.8 })
        : withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) })
    )
  }, [delay, entrance, progress, reduceMotion])

  const style = useAnimatedStyle(() => {
    const p = progress.value
    if (entrance === 'spring') {
      return {
        opacity: Math.min(1, p * 2.5),
        transform: [
          { scale: 0.6 + 0.4 * p },
          { rotate: `${(1 - p) * -12}deg` },
        ],
      }
    }
    return {
      opacity: Math.min(1, 0.4 + p),
      transform: [
        { perspective: 600 },
        { rotateY: `${(1 - p) * -22}deg` },
        { rotateX: `${(1 - p) * 8}deg` },
        { scale: 0.94 + 0.06 * p },
      ],
    }
  })

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[{ width: size, height: size }, style]}>
        <BadgeMedallion art={art} level={level} size={size} state={state} />
        {state === 'earned' && !reduceMotion ? (
          <BadgeShine
            size={size}
            delay={delay + (entrance === 'spring' ? 420 : 300)}
          />
        ) : null}
      </Animated.View>
    </View>
  )
}
