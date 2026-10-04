import { ComponentType, useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  SharedValue,
  clamp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {
  BURST_MS,
  BURST_TOTAL_MS,
  HUB,
  INTRO,
  PARALLAX,
  PillarId,
  SATELLITES,
  STAGE,
  SatelliteId,
  SatelliteSpec,
} from '@/features/onboarding/constants/welcome'
import { Tilt } from '@/features/onboarding/hooks/useWelcomeMotion'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import { SatelliteProps } from '@/features/onboarding/components/welcome/satellites/SatelliteSurface'
import PlanSatellite from '@/features/onboarding/components/welcome/satellites/PlanSatellite'
import TimerSatellite from '@/features/onboarding/components/welcome/satellites/TimerSatellite'
import MapSatellite from '@/features/onboarding/components/welcome/satellites/MapSatellite'
import VisitSatellite from '@/features/onboarding/components/welcome/satellites/VisitSatellite'
import ReportSatellite from '@/features/onboarding/components/welcome/satellites/ReportSatellite'

const SATELLITE_CONTENT: Record<SatelliteId, ComponentType<SatelliteProps>> = {
  plan: PlanSatellite,
  timer: TimerSatellite,
  map: MapSatellite,
  visit: VisitSatellite,
  report: ReportSatellite,
}

// Room for each card to lay out at its natural size around its anchor point.
const SLOT = 320

// Ease-out with a gentle overshoot, so cards settle rather than stop.
const easeOutBack = (x: number) => {
  'worklet'
  const c1 = 1.25
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

interface SatelliteSlotProps {
  spec: SatelliteSpec
  index: number
  palette: WelcomePalette
  time: SharedValue<number>
  tilt: Tilt
  burst: SharedValue<number>
  exit: SharedValue<number>
  focused: boolean
  dimmed: boolean
  reduceMotion: boolean
}

const SatelliteSlot = ({
  spec,
  index,
  palette,
  time,
  tilt,
  burst,
  exit,
  focused,
  dimmed,
  reduceMotion,
}: SatelliteSlotProps) => {
  const focus = useSharedValue(0)
  const dim = useSharedValue(0)
  const Content = SATELLITE_CONTENT[spec.id]

  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, { duration: 450 })
  }, [focused, focus])
  useEffect(() => {
    dim.value = withTiming(dimmed ? 1 : 0, { duration: 450 })
  }, [dimmed, dim])

  const style = useAnimatedStyle(() => {
    // This card's own flight, staggered within the shared burst.
    const flight = clamp(
      (burst.value * BURST_TOTAL_MS - index * INTRO.burstStagger) / BURST_MS,
      0,
      1
    )
    const out = easeOutBack(flight)
    const phase = index * 1.7
    const t = time.value
    const bob = Math.sin(t * (0.8 + spec.depth * 0.4) + phase) * 4 * spec.depth
    const sway = Math.cos(t * 0.5 + phase) * 2 * spec.depth
    const px = tilt.value.x * PARALLAX.satellites * spec.depth
    const py = tilt.value.y * PARALLAX.satellites * spec.depth
    const e = exit.value
    // Under Reduce Motion the cards only fade on the way out (and back in).
    const push = reduceMotion ? 0 : e
    return {
      opacity: clamp(flight * 2.5, 0, 1) * (1 - dim.value * 0.32) * (1 - e),
      transform: [
        { perspective: 900 },
        { translateX: -spec.dx * (1 - out) + sway + px + spec.dx * push * 0.6 },
        { translateY: -spec.dy * (1 - out) + bob + py + spec.dy * push * 0.6 },
        {
          scale:
            (0.3 + 0.7 * out) *
            (1 + focus.value * 0.06 - dim.value * 0.03) *
            (1 + push * 0.2),
        },
        { rotate: `${spec.tilt * out + sway * 0.4}deg` },
        { rotateY: `${tilt.value.x * 12 * spec.depth}deg` },
        { rotateX: `${-tilt.value.y * 12 * spec.depth}deg` },
      ],
    }
  })

  return (
    <View
      style={{
        position: 'absolute',
        left: HUB.x + spec.dx - SLOT / 2,
        top: HUB.y + spec.dy - SLOT / 2,
        width: SLOT,
        height: SLOT,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View style={style}>
        <Content
          palette={palette}
          focus={focus}
          active={focused}
          reduceMotion={reduceMotion}
        />
      </Animated.View>
    </View>
  )
}

interface Props {
  /** Hub centre in screen points. */
  hub: { x: number; y: number }
  scale: number
  palette: WelcomePalette
  time: SharedValue<number>
  tilt: Tilt
  /** 0–1 run of the cards flying out of the hub. */
  burst: SharedValue<number>
  exit: SharedValue<number>
  /** The part of the story the headline is telling, if any. */
  activePillar: PillarId | null
  reduceMotion: boolean
}

/**
 * The cards orbiting the app tile — a glimpse of the app's planning, timer,
 * visits, map and reports. They burst out of the tile, float in parallax, and
 * the one matching the headline steps forward while the rest dim.
 */
const WelcomeConstellation = ({
  hub,
  scale,
  palette,
  time,
  tilt,
  burst,
  exit,
  activePillar,
  reduceMotion,
}: Props) => (
  <View
    pointerEvents='none'
    accessibilityElementsHidden
    importantForAccessibility='no-hide-descendants'
    style={{
      position: 'absolute',
      left: hub.x - HUB.x,
      top: hub.y - HUB.y,
      width: STAGE.width,
      height: STAGE.height,
      transformOrigin: [HUB.x, HUB.y, 0],
      transform: [{ scale }],
    }}
  >
    {SATELLITES.map((spec, index) => (
      <SatelliteSlot
        key={spec.id}
        spec={spec}
        index={index}
        palette={palette}
        time={time}
        tilt={tilt}
        burst={burst}
        exit={exit}
        focused={activePillar === spec.pillar}
        dimmed={activePillar !== null && activePillar !== spec.pillar}
        reduceMotion={reduceMotion}
      />
    ))}
  </View>
)

export default WelcomeConstellation
