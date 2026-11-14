import { StyleSheet } from 'react-native'
import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  RoundedRect,
  Skia,
  rect,
  rrect,
  vec,
} from '@shopify/react-native-skia'
import Animated, {
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
import { snapCircle } from '@/features/onboarding/lib/snapCircle'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'

const TILE_TOP = '#5CE291'
const TILE_BOTTOM = '#12A04A'

const WINDOW_RADIUS = 44

const GLOW_REACH = 0.95

const FAINT = 0.012

const SPLASH_NEIGHBOR = (() => {
  const blue = parseInt(SPLASH_BACKGROUND_COLOR.slice(5, 7), 16)
  const next = blue < 255 ? blue + 1 : blue - 1
  return `${SPLASH_BACKGROUND_COLOR.slice(0, 5)}${next.toString(16).padStart(2, '0')}`
})()

const cardPath = Skia.Path.MakeFromSVGString(BRAND_MARK_CARD_PATH)
const personPath = Skia.Path.MakeFromSVGString(BRAND_MARK_PERSON_PATH)
const linesPath = Skia.Path.MakeFromSVGString(BRAND_MARK_LINES_PATH)

interface RippleProps {
  cx: number
  cy: number

  from: number
  spread: number

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
  const r = useDerivedValue(() => snapCircle(from + progress.value * spread))
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

interface TileProps {
  width: number
  height: number
  hubX: number
  hubY: number
  scale: number
  splashMarkWidth: number
  palette: WelcomePalette
  collapse: SharedValue<number>
  tileScale: SharedValue<number>

  opacity?: SharedValue<number>
}

const Tile = ({
  width,
  height,
  hubX,
  hubY,
  scale,
  splashMarkWidth,
  palette,
  collapse,
  tileScale,
  opacity,
}: TileProps) => {
  const tile = HUB_TILE_SIZE * scale
  const tileRadius = HUB_TILE_RADIUS * scale
  const markWidth = HUB_MARK_WIDTH * scale

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
      r: Math.max(1, Math.min(r, w / 2, h / 2)),
      cx: width / 2 + (hubX - width / 2) * c,
      cy: height / 2 + (hubY - height / 2) * c,
      mark: splashMarkWidth + (markWidth - splashMarkWidth) * c,
    }
  })

  const body = useDerivedValue(() => {
    const g = geometry.value
    return rrect(rect(g.cx - g.w / 2, g.cy - g.h / 2, g.w, g.h), g.r, g.r)
  })
  const glowCenter = useDerivedValue(() =>
    vec(
      snapCircle(geometry.value.cx),
      snapCircle(geometry.value.cy + 8 * scale)
    )
  )
  const glowRadius = useDerivedValue(() =>
    snapCircle(geometry.value.w * GLOW_REACH)
  )
  const glowOpacity = useDerivedValue(() =>
    Math.max(FAINT, (geometry.value.c - 0.75) / 0.25)
  )
  const bevelOpacity = useDerivedValue(() =>
    Math.max(FAINT, Math.pow(geometry.value.c, 4))
  )
  const gradientStart = useDerivedValue(() =>
    vec(geometry.value.cx, geometry.value.cy - geometry.value.h / 2)
  )
  const gradientEnd = useDerivedValue(() =>
    vec(geometry.value.cx, geometry.value.cy + geometry.value.h / 2)
  )

  const fill = useDerivedValue(() => [
    interpolateColor(
      collapse.value,
      [0, 1],
      [SPLASH_BACKGROUND_COLOR, TILE_TOP]
    ),
    interpolateColor(collapse.value, [0, 1], [SPLASH_NEIGHBOR, TILE_BOTTOM]),
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

  return (
    <Group transform={bounce} origin={bounceOrigin} opacity={opacity ?? 1}>
      <Circle c={glowCenter} r={glowRadius} opacity={glowOpacity}>
        <RadialGradient
          c={glowCenter}
          r={glowRadius}
          colors={[
            palette.tileShadow,
            palette.tileShadow,
            palette.tileShadowClear,
          ]}
          positions={[0, 0.5, 1]}
        />
      </Circle>
      <RoundedRect rect={body}>
        <LinearGradient start={gradientStart} end={gradientEnd} colors={fill} />
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
  )
}

interface Props {
  width: number
  height: number

  hub: { x: number; y: number } | null
  scale: number

  splashMarkWidth: number
  palette: WelcomePalette

  collapse: SharedValue<number>

  tileScale: SharedValue<number>

  ripple: SharedValue<number>

  rehearsal?: { collapse: SharedValue<number>; on: SharedValue<number> }
  tilt: Tilt
  exit: SharedValue<number>

  reduceMotion: boolean
}

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
  rehearsal,
  tilt,
  exit,
  reduceMotion,
}: Props) => {
  const tile = HUB_TILE_SIZE * scale
  const hubX = snapCircle(hub?.x ?? width / 2)
  const hubY = snapCircle(hub?.y ?? height / 2)

  const layerStyle = useAnimatedStyle(() => {
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
  const shared = {
    width,
    height,
    hubX,
    hubY,
    scale,
    splashMarkWidth,
    palette,
    tileScale,
  }

  return (
    <Animated.View
      pointerEvents='none'
      style={[StyleSheet.absoluteFill, { transformOrigin: origin }, layerStyle]}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        {rehearsal && (
          <Tile
            {...shared}
            collapse={rehearsal.collapse}
            opacity={rehearsal.on}
          />
        )}
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
        <Tile {...shared} collapse={collapse} />
      </Canvas>
    </Animated.View>
  )
}

export default WelcomeCurtain
