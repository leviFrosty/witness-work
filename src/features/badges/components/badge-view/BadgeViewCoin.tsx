import { StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import BadgeShine from '@/features/badges/components/BadgeShine'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'

const showsFront = (turn: number) => {
  'worklet'
  const angle = (((turn * 360) % 360) + 360) % 360
  return angle <= 90 || angle >= 270
}

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
        {}
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
