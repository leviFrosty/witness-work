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
  /** The string to animate. Only plain strings are supported. */
  children: string
  /**
   * Resting (full-strength) colour of the text. Defaults to the colour from
   * `style`, falling back to the primary text colour. The text always sits at
   * this colour — the shine only lifts it slightly, never dims it.
   */
  baseColor?: string
  /** Colour the shine band eases toward. Defaults to white (a soft highlight). */
  highlightColor?: string
  /**
   * How far, 0–1, the brightest point of the band travels toward
   * `highlightColor`. Kept low so the shine is a subtle lift, not a flash.
   */
  strength?: number
  /** Glyphs traversed per second — lower is slower / more subtle. */
  speed?: number
  /** Half-width (in glyphs) of the shine band's soft falloff. */
  spread?: number
  /** Set false to render flat (no animation), e.g. once work has finished. */
  enabled?: boolean
}

// Glyphs of empty space kept off both ends of the string so the shine fully
// enters and exits the text, with a short rest before it loops back around.
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

/**
 * One glyph whose colour eases between base and highlight as the shine band
 * passes over its position — a Gaussian falloff keeps the band's edges soft so
 * the sweep reads as a gradient of light rather than a hard switch.
 */
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
    // Travel from just off the left edge, across the text, and off the right —
    // wrapping seamlessly because intensity is ~0 at both ends.
    const wavePos = ((time.value * speed) % cycle) - band
    const d = (index - wavePos) / spread
    // Peak caps at `strength`, so a glyph never fully reaches the highlight —
    // the text stays at base colour and is only lifted toward it.
    const intensity = Math.exp(-(d * d)) * strength
    return {
      color: interpolateColor(intensity, [0, 1], [baseColor, highlightColor]),
    }
  })

  return <Animated.Text style={[style, animatedStyle]}>{char}</Animated.Text>
}

/**
 * Text with a slow, subtle shine that sweeps across the glyphs — a soft band of
 * light that lifts the letters' colour slightly as it passes. The text always
 * sits at full strength (never dimmed) and nothing about the layout moves (no
 * scaling, no translation), so it reads as "something is happening" without
 * jostling the UI or hurting legibility.
 *
 * Built on Reanimated (mirrors `AuroraBorder`'s frame-callback shimmer) and
 * honours Reduce Motion. Mirrors `MyText`'s theming and font-size scaling, so
 * it's a drop-in for any processing / "thinking" label:
 *
 * ```tsx
 * ;<ShimmerText style={{ fontFamily: theme.fonts.semiBold }}>
 *   {i18n.t('notesImport_deliberating')}
 * </ShimmerText>
 * ```
 */
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
  const { fontSizeOffset } = usePreferences()
  const reduceMotion = useReducedMotion()
  const time = useSharedValue(0)
  const active = enabled && !reduceMotion

  const frameCallback = useFrameCallback((frame) => {
    'worklet'
    time.value = frame.timeSinceFirstFrame / 1000
  })

  // Pause the per-frame callback when inactive instead of spinning a worklet
  // that does nothing, and react to a runtime Reduce Motion / `enabled` toggle.
  useEffect(() => {
    frameCallback.setActive(active)
  }, [active, frameCallback])

  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle
  const { color: styleColor, ...layout } = flat
  const fontSize = (flat.fontSize ?? theme.fontSize('md')) + fontSizeOffset
  const resolvedBase =
    baseColor ?? (styleColor as string | undefined) ?? theme.colors.text
  const resolvedHighlight = highlightColor ?? '#FFFFFF'

  // Inactive: plain, full-colour text — never the dimmed/lifted variant.
  if (!active) {
    return (
      <Text {...textProps} style={style}>
        {children}
      </Text>
    )
  }

  // Color is driven per-glyph by the animation; the shared style carries only
  // layout/typography. Default to the regular weight, overridden by `style`.
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
          // Glyphs are positional and may repeat, so the index anchors identity.
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
