import { useEffect } from 'react'
import { StyleSheet, TextProps, TextStyle } from 'react-native'
import Animated, {
  interpolateColor,
  SharedValue,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'

interface Props extends Omit<TextProps, 'children'> {
  children: string

  baseColor?: string

  highlightColor?: string

  strength?: number

  speed?: number

  spread?: number

  enabled?: boolean
}

const REST_GLYPHS = 7

interface CharProps {
  char: string
  index: number
  total: number
  time: SharedValue<number>
  speed: number
  spread: number
  band: number
  strength: number
  baseColor: string
  highlightColor: string
  style: TextStyle
}

const ShimmerChar = ({
  char,
  index,
  total,
  time,
  speed,
  spread,
  band,
  strength,
  baseColor,
  highlightColor,
  style,
}: CharProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet'
    const cycle = total + band * 2 + REST_GLYPHS

    const wavePos = ((time.value * speed) % cycle) - band
    const d = (index - wavePos) / spread

    const intensity = Math.exp(-(d * d)) * strength
    return {
      color: interpolateColor(intensity, [0, 1], [baseColor, highlightColor]),
    }
  })

  return <Animated.Text style={[style, animatedStyle]}>{char}</Animated.Text>
}

const ShimmerText = ({
  children,
  style,
  baseColor,
  highlightColor,
  strength = 0.2,
  speed = 9,
  spread = 2.4,
  enabled = true,
  ...textProps
}: Props) => {
  const theme = useTheme()
  const fontSizeOffset = usePreferences((s) => s.fontSizeOffset)
  const reduceMotion = useReducedMotion()
  const time = useSharedValue(0)
  const active = enabled && !reduceMotion

  const frameCallback = useFrameCallback((frame) => {
    'worklet'
    time.value = frame.timeSinceFirstFrame / 1000
  })

  useEffect(() => {
    frameCallback.setActive(active)
  }, [active, frameCallback])

  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle
  const { color: styleColor, ...layout } = flat
  const fontSize = (flat.fontSize ?? theme.fontSize('md')) + fontSizeOffset
  const resolvedBase =
    baseColor ?? (styleColor as string | undefined) ?? theme.colors.text
  const resolvedHighlight = highlightColor ?? '#FFFFFF'

  if (!active) {
    return (
      <Text {...textProps} style={style}>
        {children}
      </Text>
    )
  }

  const charStyle: TextStyle = {
    fontFamily: theme.fonts.regular,
    ...layout,
    fontSize,
  }
  const glyphs = Array.from(children)
  const band = spread * 1.7

  return (
    <Text {...textProps} accessibilityLabel={children} style={style}>
      {glyphs.map((glyph, index) => (
        <ShimmerChar
          key={`${index}-${glyph}`}
          char={glyph}
          index={index}
          total={glyphs.length}
          time={time}
          speed={speed}
          spread={spread}
          band={band}
          strength={strength}
          baseColor={resolvedBase}
          highlightColor={resolvedHighlight}
          style={charStyle}
        />
      ))}
    </Text>
  )
}

export default ShimmerText
