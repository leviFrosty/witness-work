import { StyleSheet } from 'react-native'
import {
  Blend,
  Canvas,
  Circle,
  Fill,
  Group,
  RadialGradient,
  Shader,
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
import { withAlpha } from '@/lib/color'
import { snapCircle } from '@/features/onboarding/lib/snapCircle'

const COMET_TAIL = 70

const SWEEP_OVERSHOOT = 360 * 1.01
const SWEEP_EDGE = 0.002
const sweepStop = (turn: number) => {
  'worklet'
  return 0.002 + Math.min(Math.max(turn, 0), 1) * 0.9915
}

interface OrbitProps {
  cx: number
  cy: number
  r: number

  from: number

  speed: number
  palette: WelcomePalette
  time: SharedValue<number>
  drawn: SharedValue<number>
  reveal: SharedValue<number>
}

const Orbit = ({
  cx: rawX,
  cy: rawY,
  r: rawR,
  from,
  speed,
  palette,
  time,
  drawn,
  reveal,
}: OrbitProps) => {
  const clockwise = speed > 0
  const cx = snapCircle(rawX)
  const cy = snapCircle(rawY)
  const r = snapCircle(rawR)
  const center = vec(cx, cy)
  const comet = vec(cx + r, cy)

  const rotation = useDerivedValue(() => [
    { rotate: (from * Math.PI) / 180 + time.value * speed },
  ])

  const ringOpacity = useDerivedValue(() =>
    drawn.value > 0 ? reveal.value : 0
  )
  const ringStops = useDerivedValue(() => {
    const at = sweepStop(drawn.value)
    return [at, at + SWEEP_EDGE]
  })
  const lightOpacity = useDerivedValue(
    () => Math.max(0, (drawn.value - 0.7) / 0.3) * reveal.value
  )

  return (
    <Group>
      <Circle
        c={center}
        r={r}
        style='stroke'
        strokeWidth={1}
        opacity={ringOpacity}
      >
        <SweepGradient
          c={center}
          start={0}
          end={SWEEP_OVERSHOOT}
          colors={[palette.orbit, 'transparent']}
          positions={ringStops}
          origin={center}
          transform={[{ rotate: (from * Math.PI) / 180 }]}
        />
      </Circle>
      <Group transform={rotation} origin={center} opacity={lightOpacity}>
        <Circle c={center} r={r} style='stroke' strokeWidth={1.5}>
          <SweepGradient
            c={center}
            start={clockwise ? 360 - COMET_TAIL : 0}
            end={clockwise ? 360 : COMET_TAIL}
            colors={
              clockwise
                ? ['transparent', palette.orbitLight]
                : [palette.orbitLight, 'transparent']
            }
          />
        </Circle>
        <Circle c={comet} r={14} opacity={0.4}>
          <RadialGradient
            c={comet}
            r={14}
            colors={[palette.orbitLight, withAlpha(palette.orbitLight, 0)]}
          />
        </Circle>
        <Circle c={comet} r={2.25} color={palette.orbitDot} />
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

const HubRing = ({
  cx: rawX,
  cy: rawY,
  r: rawR,
  width,
  start,
  end,
  reveal,
  palette,
}: RingProps) => {
  const cx = snapCircle(rawX)
  const cy = snapCircle(rawY)
  const r = snapCircle(rawR)
  const center = vec(cx, cy)
  const fromTop = [{ rotate: -Math.PI / 2 }]
  const cap = snapCircle(width / 2)
  const glow = snapCircle(width * 1.6 + 10)

  const point = (turn: number) => {
    'worklet'
    const angle = -Math.PI / 2 + turn * Math.PI * 2
    return vec(
      snapCircle(cx + r * Math.cos(angle)),
      snapCircle(cy + r * Math.sin(angle))
    )
  }
  const head = useDerivedValue(() => point(end.value))
  const tail = useDerivedValue(() => point(start.value))
  const shown = useDerivedValue(() => (end.value - start.value > 0.01 ? 1 : 0))
  const headOpacity = useDerivedValue(() => shown.value * 0.8)
  const span = useDerivedValue(() => {
    const from = sweepStop(start.value)
    const to = Math.max(from + SWEEP_EDGE * 2, sweepStop(end.value))
    return [from, from + SWEEP_EDGE, to, to + SWEEP_EDGE]
  })

  const colors = (
    <SweepGradient
      c={center}
      colors={palette.ring}
      origin={center}
      transform={fromTop}
    />
  )

  return (
    <Group opacity={reveal}>
      <Circle
        c={center}
        r={r}
        style='stroke'
        strokeWidth={width}
        color={palette.ringTrack}
      />
      <Circle
        c={center}
        r={r}
        style='stroke'
        strokeWidth={width}
        opacity={shown}
      >
        <Blend mode='modulate'>
          {colors}
          <SweepGradient
            c={center}
            start={0}
            end={SWEEP_OVERSHOOT}
            colors={['transparent', '#FFFFFF', '#FFFFFF', 'transparent']}
            positions={span}
            origin={center}
            transform={fromTop}
          />
        </Blend>
      </Circle>
      <Circle c={tail} r={cap} opacity={shown}>
        {colors}
      </Circle>
      <Circle c={head} r={cap} opacity={shown}>
        {colors}
      </Circle>
      <Circle c={head} r={glow} opacity={headOpacity}>
        <RadialGradient
          c={head}
          r={glow}
          colors={[palette.ringHead, withAlpha(palette.ringHead, 0)]}
        />
      </Circle>
    </Group>
  )
}

interface Props {
  width: number
  height: number
  hub: { x: number; y: number }

  scale: number
  palette: WelcomePalette
  time: SharedValue<number>
  tilt: Tilt

  reveal: SharedValue<number>

  orbits: SharedValue<number>
  ringStart: SharedValue<number>
  ringEnd: SharedValue<number>

  pulse: SharedValue<number>

  chrome?: SharedValue<number>
}

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
