import { StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import BadgeShine from '@/features/badges/components/BadgeShine'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'

/** The share of a turn (0..1) that shows the face, not the back. */
const showsFront = (turn: number) => {
  'worklet'
  const angle = (((turn * 360) % 360) + 360) % 360
  return angle <= 90 || angle >= 270
}

/**
 * The badge view's coin: the medallion on the front and its plain metal on the
 * back, swapped as `turn` (whole turns on rotateY, applied by the parent)
 * passes edge-on. `shine` replays the light sweep whenever it changes; null
 * skips it (Reduce Motion, locked).
 */
export default function BadgeViewCoin({
  art,
  level,
  size,
  state,
  turn,
  shine,
}: {
  art: BadgeArtId
  level: BadgeLevel | null
  size: number
  state: 'earned' | 'locked'
  turn: SharedValue<number>
  shine: number | null
}) {
  const frontStyle = useAnimatedStyle(() => ({
    opacity: showsFront(turn.value) ? 1 : 0,
  }))
  const backStyle = useAnimatedStyle(() => ({
    opacity: showsFront(turn.value) ? 0 : 1,
  }))

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, backStyle]}>
        {/* Mirrored, so its light falls from the same side once turned. */}
        <View style={{ transform: [{ rotateY: '180deg' }] }}>
          <BadgeMedallion
            art={art}
            level={level}
            size={size}
            state={state}
            face='back'
          />
        </View>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>
        <BadgeMedallion art={art} level={level} size={size} state={state} />
        {shine !== null ? (
          <BadgeShine key={shine} size={size} duration={1100} />
        ) : null}
      </Animated.View>
    </View>
  )
}
