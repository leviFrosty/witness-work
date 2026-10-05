import { StyleSheet } from 'react-native'
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RoundedRect,
  Skia,
  rect,
  rrect,
  vec,
} from '@shopify/react-native-skia'
import Animated, {
  DerivedValue,
  SharedValue,
  clamp,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import {
  BRAND_MARK_CARD_PATH,
  BRAND_MARK_LINES_PATH,
  BRAND_MARK_PERSON_PATH,
  BRAND_MARK_SIZE,
  SPLASH_BACKGROUND_COLOR,
} from '@/constants/brandMark'
import {
  HUB_MARK_WIDTH,
  HUB_TILE_RADIUS,
  HUB_TILE_SIZE,
  PARALLAX,
} from '@/features/onboarding/constants/welcome'
import { Tilt } from '@/features/onboarding/hooks/useWelcomeMotion'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'

const TILE_TOP = '#5CE291'
const TILE_BOTTOM = '#12A04A'
// The corner radius an app window has mid-collapse, before it settles on the
// tile's own radius.
const WINDOW_RADIUS = 44

const cardPath = Skia.Path.MakeFromSVGString(BRAND_MARK_CARD_PATH)
const personPath = Skia.Path.MakeFromSVGString(BRAND_MARK_PERSON_PATH)
const linesPath = Skia.Path.MakeFromSVGString(BRAND_MARK_LINES_PATH)

interface RippleProps {
  cx: number
  cy: number
  /** Radius the ring starts from, and how far it spreads. */
  from: number
  spread: number
  /** 0–1 share of the ripple's run before this ring sets off. */
  lag: number
  strokeWidth: number
  color: string
  ripple: SharedValue<number>
}

const RippleRing = ({
  cx,
  cy,
  from,
  spread,
  lag,
  strokeWidth,
  color,
  ripple,
}: RippleProps) => {
  const progress = useDerivedValue(() =>
    clamp((ripple.value - lag) / (1 - lag), 0, 1)
  )
  const r = useDerivedValue(() => from + progress.value * spread)
  const opacity = useDerivedValue(() =>
    progress.value > 0 && progress.value < 1 ? (1 - progress.value) * 0.55 : 0
  )
  return (
    <Circle
      cx={cx}
      cy={cy}
      r={r}
      style='stroke'
      strokeWidth={strokeWidth}
      color={color}
      opacity={opacity}
    />
  )
}

interface Props {
  width: number
  height: number
  /** Where the tile comes to rest; `null` until the stage is measured. */
  hub: { x: number; y: number } | null
  scale: number
  /** Width the native splash drew the mark at, so frame one matches it. */
  splashMarkWidth: number
  palette: WelcomePalette
  /** 0 = the full-screen splash, 1 = the settled app tile. */
  collapse: SharedValue<number>
  /** Landing squash on the settled tile. */
  tileScale: DerivedValue<number>
  /** 0–1 rings that spread from the tile as it lands. */
  ripple: SharedValue<number>
  tilt: Tilt
  exit: SharedValue<number>
  /** The exit (and its reverse) is a plain fade. */
  reduceMotion: boolean
}

/**
 * The welcome's opening move: the splash screen collapses into a tile — the
 * splash in miniature, folding away the way iOS shrinks a closing app into its
 * icon — revealing the scene behind it. The tile then stays on top as the hub
 * of the constellation.
 */
const WelcomeCurtain = ({
  width,
  height,
  hub,
  scale,
  splashMarkWidth,
  palette,
  collapse,
  tileScale,
  ripple,
  tilt,
  exit,
  reduceMotion,
}: Props) => {
  const tile = HUB_TILE_SIZE * scale
  const tileRadius = HUB_TILE_RADIUS * scale
  const markWidth = HUB_MARK_WIDTH * scale
  const hubX = hub?.x ?? width / 2
  const hubY = hub?.y ?? height / 2

  const geometry = useDerivedValue(() => {
    const c = collapse.value
    const w = width + (tile - width) * c
    const h = height + (tile - height) * c
    const r =
      c < 0.18
        ? (c / 0.18) * WINDOW_RADIUS
        : WINDOW_RADIUS + (tileRadius - WINDOW_RADIUS) * ((c - 0.18) / 0.82)
    return {
      c,
      w,
      h,
      r: Math.min(r, w / 2, h / 2),
      cx: width / 2 + (hubX - width / 2) * c,
      cy: height / 2 + (hubY - height / 2) * c,
      mark: splashMarkWidth + (markWidth - splashMarkWidth) * c,
    }
  })

  const body = useDerivedValue(() => {
    const g = geometry.value
    return rrect(rect(g.cx - g.w / 2, g.cy - g.h / 2, g.w, g.h), g.r, g.r)
  })
  const glow = useDerivedValue(() => {
    const g = geometry.value
    const lift = 8 * scale
    return rrect(
      rect(g.cx - g.w / 2, g.cy - g.h / 2 + lift, g.w, g.h),
      g.r,
      g.r
    )
  })
  const glowOpacity = useDerivedValue(() =>
    Math.max(0, (geometry.value.c - 0.75) / 0.25)
  )
  const bevelOpacity = useDerivedValue(() => Math.pow(geometry.value.c, 4))
  const gradientStart = useDerivedValue(() =>
    vec(geometry.value.cx, geometry.value.cy - geometry.value.h / 2)
  )
  const gradientEnd = useDerivedValue(() =>
    vec(geometry.value.cx, geometry.value.cy + geometry.value.h / 2)
  )
  // The splash is one flat green; the tile picks up an icon-like light falloff.
  const fill = useDerivedValue(() => [
    interpolateColor(
      collapse.value,
      [0, 1],
      [SPLASH_BACKGROUND_COLOR, TILE_TOP]
    ),
    interpolateColor(
      collapse.value,
      [0, 1],
      [SPLASH_BACKGROUND_COLOR, TILE_BOTTOM]
    ),
  ])
  const bounceOrigin = useDerivedValue(() =>
    vec(geometry.value.cx, geometry.value.cy)
  )
  const bounce = useDerivedValue(() => [{ scale: tileScale.value }])
  const markTransform = useDerivedValue(() => {
    const g = geometry.value
    return [
      { translateX: g.cx },
      { translateY: g.cy },
      { scale: g.mark / BRAND_MARK_SIZE.width },
      { translateX: -BRAND_MARK_SIZE.width / 2 },
      { translateY: -BRAND_MARK_SIZE.height / 2 },
    ]
  })

  const layerStyle = useAnimatedStyle(() => {
    // Tilt only once collapsed, so the full-screen curtain never shows an edge.
    const settled = Math.pow(collapse.value, 6)
    return {
      opacity: 1 - exit.value,
      transform: [
        { translateX: tilt.value.x * PARALLAX.hub * settled },
        { translateY: tilt.value.y * PARALLAX.hub * settled },
        { scale: reduceMotion ? 1 : 1 + exit.value * 0.35 },
      ],
    }
  })

  const origin = [hubX, hubY, 0]

  return (
    <Animated.View
      pointerEvents='none'
      style={[StyleSheet.absoluteFill, { transformOrigin: origin }, layerStyle]}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <RippleRing
          cx={hubX}
          cy={hubY}
          from={tile * 0.55}
          spread={96 * scale}
          lag={0}
          strokeWidth={2}
          color={palette.ripple}
          ripple={ripple}
        />
        <RippleRing
          cx={hubX}
          cy={hubY}
          from={tile * 0.55}
          spread={96 * scale}
          lag={0.2}
          strokeWidth={1.2}
          color={palette.ripple}
          ripple={ripple}
        />
        <Group transform={bounce} origin={bounceOrigin}>
          <RoundedRect
            rect={glow}
            color={palette.tileShadow}
            opacity={glowOpacity}
          >
            <BlurMask blur={16 * scale} style='normal' />
          </RoundedRect>
          <RoundedRect rect={body}>
            <LinearGradient
              start={gradientStart}
              end={gradientEnd}
              colors={fill}
            />
          </RoundedRect>
          <RoundedRect
            rect={body}
            style='stroke'
            strokeWidth={1.2}
            opacity={bevelOpacity}
          >
            <LinearGradient
              start={gradientStart}
              end={gradientEnd}
              colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
              positions={[0, 0.55]}
            />
          </RoundedRect>
          <Group transform={markTransform}>
            {cardPath && (
              <Path path={cardPath} color='#FFFFFF' fillType='evenOdd' />
            )}
            {personPath && <Path path={personPath} color='#FFFFFF' />}
            {linesPath && <Path path={linesPath} color='#FFFFFF' />}
          </Group>
        </Group>
      </Canvas>
    </Animated.View>
  )
}

export default WelcomeCurtain
