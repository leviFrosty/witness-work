import { StyleProp, View, ViewStyle } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'

const PIECE_COUNT = 22
/** Points per unit of progress the pieces fall by the end of the burst. */
const GRAVITY = 110

/**
 * Fixed scatter, so every burst looks composed: pieces fan out mostly upward
 * and to the sides, at a few speeds and spins, and alternate strips and dots.
 */
const PIECES = Array.from({ length: PIECE_COUNT }, (_, i) => {
  const spread = (i / (PIECE_COUNT - 1) - 0.5) * 2 // -1…1, left to right
  const jitter = (((i * 37) % 7) - 3) * 0.06
  return {
    angle: -Math.PI / 2 + spread * 1.45 + jitter,
    speed: 70 + ((i * 53) % 5) * 15,
    spin: (((i * 29) % 9) - 4) * 110,
    flutter: 3 + (i % 3),
    phase: i * 0.9,
    dot: i % 4 === 1,
    width: i % 4 === 1 ? 6.5 : 9 - (i % 2) * 2,
    height: i % 4 === 1 ? 6.5 : 4,
    color: i % 6,
  }
})

/**
 * A small confetti burst from one point, drawn with views so it stays inside
 * the preview and replays exactly as `progress` runs 0→1. Hidden at 0 and 1.
 */
const ConfettiBurst = ({
  progress,
  style,
}: {
  progress: DerivedValue<number>
  /** Places the burst's origin; it has no size of its own. */
  style?: StyleProp<ViewStyle>
}) => {
  const theme = useTheme()
  const colors = [
    theme.colors.accent,
    theme.colors.warn,
    theme.colors.cyan,
    theme.colors.accent2,
    theme.colors.indigo,
    theme.colors.orange,
  ]

  return (
    <View
      pointerEvents='none'
      style={[{ position: 'absolute', width: 0, height: 0 }, style]}
    >
      {PIECES.map((piece, index) => (
        <Piece
          key={index}
          piece={piece}
          color={colors[piece.color]}
          progress={progress}
        />
      ))}
    </View>
  )
}

const Piece = ({
  piece,
  color,
  progress,
}: {
  piece: (typeof PIECES)[number]
  color: string
  progress: DerivedValue<number>
}) => {
  const style = useAnimatedStyle(() => {
    const p = progress.value
    if (p <= 0 || p >= 1) return { opacity: 0 }
    const out = 1 - Math.pow(1 - p, 2.4)
    const x = Math.cos(piece.angle) * piece.speed * out
    const y = Math.sin(piece.angle) * piece.speed * out + GRAVITY * p * p
    const fade = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45
    return {
      opacity: Math.min(1, p * 12) * fade,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${piece.spin * p}deg` },
        // Strips tumble as they fall; dots just shrink a little.
        {
          scaleX: piece.dot
            ? 1 - p * 0.3
            : 0.3 +
              0.7 *
                Math.abs(Math.cos(p * Math.PI * piece.flutter + piece.phase)),
        },
      ],
    }
  })

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: -piece.width / 2,
          top: -piece.height / 2,
          width: piece.width,
          height: piece.height,
          borderRadius: piece.dot ? piece.width / 2 : 1,
          backgroundColor: color,
        },
        style,
      ]}
    />
  )
}

export default ConfettiBurst
