import { StyleSheet } from 'react-native'
import {
  BlurMask,
  Canvas,
  Circle,
  Fill,
  Group,
  Path,
  Shader,
  Skia,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia'
import { SharedValue, useDerivedValue } from 'react-native-reanimated'
import {
  HUB_RING_RADIUS,
  HUB_RING_WIDTH,
  ORBIT_RADII,
  PARALLAX,
} from '@/features/onboarding/constants/welcome'
import { Tilt } from '@/features/onboarding/hooks/useWelcomeMotion'
import { auroraShader } from '@/features/onboarding/lib/auroraShader'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'

const COMET_TAIL = 70

interface OrbitProps {
  cx: number
  cy: number
  r: number
  /** Angle (degrees) the orbit starts drawing in from. */
  from: number
  /** Radians per second; negative orbits counter-clockwise. */
  speed: number
  palette: WelcomePalette
  time: SharedValue<number>
  drawn: SharedValue<number>
  reveal: SharedValue<number>
}

/**
 * A faint orbit around the hub that draws itself in, then carries a small light
 * with a fading tail — the "everything revolves around your ministry" motif.
 */
const Orbit = ({
  cx,
  cy,
  r,
  from,
  speed,
  palette,
  time,
  drawn,
  reveal,
}: OrbitProps) => {
  const clockwise = speed > 0
  const bounds = Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2)
  const ring = Skia.PathBuilder.Make().addArc(bounds, from, 359.9).detach()
  // The tail trails the light, which sits at 0° before rotation.
  const tail = Skia.PathBuilder.Make()
    .addArc(bounds, clockwise ? -COMET_TAIL : 0, COMET_TAIL)
    .detach()

  const rotation = useDerivedValue(() => [
    { rotate: (from * Math.PI) / 180 + time.value * speed },
  ])
  // The light only sets off once its orbit has nearly finished drawing.
  const lightOpacity = useDerivedValue(
    () => Math.max(0, (drawn.value - 0.7) / 0.3) * reveal.value
  )

  return (
    <Group>
      <Path
        path={ring}
        style='stroke'
        strokeWidth={1}
        color={palette.orbit}
        start={0}
        end={drawn}
        opacity={reveal}
      />
      <Group transform={rotation} origin={vec(cx, cy)} opacity={lightOpacity}>
        <Path path={tail} style='stroke' strokeWidth={1.5} strokeCap='round'>
          <SweepGradient
            c={vec(cx, cy)}
            start={clockwise ? 360 - COMET_TAIL : 0}
            end={clockwise ? 360 : COMET_TAIL}
            colors={
              clockwise
                ? ['transparent', palette.orbitLight]
                : [palette.orbitLight, 'transparent']
            }
          />
        </Path>
        <Circle
          cx={cx + r}
          cy={cy}
          r={6}
          color={palette.orbitLight}
          opacity={0.5}
        >
          <BlurMask blur={5} style='normal' />
        </Circle>
        <Circle cx={cx + r} cy={cy} r={2.2} color={palette.orbitDot} />
      </Group>
    </Group>
  )
}

interface RingProps {
  cx: number
  cy: number
  r: number
  width: number
  start: SharedValue<number>
  end: SharedValue<number>
  reveal: SharedValue<number>
  palette: WelcomePalette
}

/** The month's progress, filling around the app tile as the story plays. */
const HubRing = ({
  cx,
  cy,
  r,
  width,
  start,
  end,
  reveal,
  palette,
}: RingProps) => {
  const arc = Skia.PathBuilder.Make()
    .addArc(Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2), -90, 359.99)
    .detach()
  const head = useDerivedValue(() => {
    const angle = -Math.PI / 2 + end.value * Math.PI * 2
    return vec(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
  })
  const headOpacity = useDerivedValue(() =>
    end.value - start.value > 0.01 ? 0.8 : 0
  )

  return (
    <Group opacity={reveal}>
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        style='stroke'
        strokeWidth={width}
        color={palette.ringTrack}
      />
      <Path
        path={arc}
        style='stroke'
        strokeWidth={width}
        strokeCap='round'
        start={start}
        end={end}
      >
        <SweepGradient
          c={vec(cx, cy)}
          colors={palette.ring}
          origin={vec(cx, cy)}
          transform={[{ rotate: -Math.PI / 2 }]}
        />
      </Path>
      <Circle
        c={head}
        r={width * 1.6}
        color={palette.ringHead}
        opacity={headOpacity}
      >
        <BlurMask blur={6} style='normal' />
      </Circle>
    </Group>
  )
}

interface Props {
  width: number
  height: number
  hub: { x: number; y: number }
  /** Constellation scale — design units to points. */
  scale: number
  palette: WelcomePalette
  time: SharedValue<number>
  tilt: Tilt
  /** 0–1 reveal of the whole scene. */
  reveal: SharedValue<number>
  /** 0–1 draw-in of the orbits. */
  orbits: SharedValue<number>
  ringStart: SharedValue<number>
  ringEnd: SharedValue<number>
  /** Extra bloom behind the hub. */
  pulse: SharedValue<number>
  /** Opacity of the orbits and ring, to clear them off the aurora. */
  chrome?: SharedValue<number>
}

/**
 * The welcome scene's backdrop, drawn in one Skia canvas: the aurora shader,
 * the orbits, and the progress ring around the hub.
 */
const WelcomeBackdrop = ({
  width,
  height,
  hub,
  scale,
  palette,
  time,
  tilt,
  reveal,
  orbits,
  ringStart,
  ringEnd,
  pulse,
  chrome,
}: Props) => {
  const { aurora } = palette
  const uniforms = useDerivedValue(() => ({
    uSize: [width, height],
    uTime: time.value,
    uIntensity: reveal.value,
    uFocus: [
      hub.x + tilt.value.x * PARALLAX.hub,
      hub.y + tilt.value.y * PARALLAX.hub,
    ],
    uPulse: pulse.value,
    uShift: [-tilt.value.x * PARALLAX.aurora, -tilt.value.y * PARALLAX.aurora],
    uDark: aurora.dark,
    uBase: aurora.base,
    uGlow: aurora.glow,
    uTintA: aurora.tintA,
    uTintB: aurora.tintB,
    uFloor: aurora.floor,
    uMotes: aurora.motes * reveal.value,
  }))
  const hubShift = useDerivedValue(() => [
    { translateX: tilt.value.x * PARALLAX.hub },
    { translateY: tilt.value.y * PARALLAX.hub },
  ])

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents='none'>
      {auroraShader ? (
        <Fill>
          <Shader source={auroraShader} uniforms={uniforms} />
        </Fill>
      ) : (
        <Fill color={palette.base} />
      )}
      <Group transform={hubShift} opacity={chrome ?? 1}>
        <Orbit
          cx={hub.x}
          cy={hub.y}
          r={ORBIT_RADII[0] * scale}
          from={-90}
          speed={0.32}
          palette={palette}
          time={time}
          drawn={orbits}
          reveal={reveal}
        />
        <Orbit
          cx={hub.x}
          cy={hub.y}
          r={ORBIT_RADII[1] * scale}
          from={90}
          speed={-0.2}
          palette={palette}
          time={time}
          drawn={orbits}
          reveal={reveal}
        />
        <HubRing
          cx={hub.x}
          cy={hub.y}
          r={HUB_RING_RADIUS * scale}
          width={HUB_RING_WIDTH * scale}
          start={ringStart}
          end={ringEnd}
          reveal={reveal}
          palette={palette}
        />
      </Group>
    </Canvas>
  )
}

export default WelcomeBackdrop
