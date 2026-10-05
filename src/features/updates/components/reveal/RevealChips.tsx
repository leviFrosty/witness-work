import { StyleSheet, View } from 'react-native'
import Animated, {
  SharedValue,
  clamp,
  useAnimatedStyle,
} from 'react-native-reanimated'
import LucideIcon from '@/components/ui/LucideIcon'
import { withAlpha } from '@/lib/color'
import { HUB, PARALLAX, STAGE } from '@/features/onboarding/constants/welcome'
import { Tilt } from '@/features/onboarding/hooks/useWelcomeMotion'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import {
  REVEAL_BURST_TOTAL_MS,
  REVEAL_CHIP_FLIGHT_MS,
  REVEAL_CHIP_STAGGER_MS,
} from '@/features/updates/constants/updateReveal'
import { RevealChip } from '@/features/updates/hooks/useRevealPages'

// Ease-out with a gentle overshoot, so chips settle rather than stop.
const easeOutBack = (x: number) => {
  'worklet'
  const c1 = 1.4
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

interface ChipProps {
  chip: RevealChip
  index: number
  palette: WelcomePalette
  time: SharedValue<number>
  tilt: Tilt
  burst: SharedValue<number>
  exit: SharedValue<number>
  reduceMotion: boolean
}

const Chip = ({
  chip,
  index,
  palette,
  time,
  tilt,
  burst,
  exit,
  reduceMotion,
}: ChipProps) => {
  const size = chip.size
  const style = useAnimatedStyle(() => {
    // This chip's own flight, staggered within the shared burst.
    const flight = clamp(
      (burst.value * REVEAL_BURST_TOTAL_MS - index * REVEAL_CHIP_STAGGER_MS) /
        REVEAL_CHIP_FLIGHT_MS,
      0,
      1
    )
    const out = easeOutBack(flight)
    const phase = index * 1.3
    const t = reduceMotion ? 0 : time.value
    const bob = Math.sin(t * (0.9 + chip.depth * 0.5) + phase) * 5 * chip.depth
    const sway = Math.cos(t * 0.6 + phase) * 2.5 * chip.depth
    const px = tilt.value.x * PARALLAX.satellites * chip.depth
    const py = tilt.value.y * PARALLAX.satellites * chip.depth
    const e = exit.value
    // On the way out the chips scatter past the screen's edge; under Reduce
    // Motion they only fade.
    const push = reduceMotion ? 0 : e
    return {
      opacity: clamp(flight * 3, 0, 1) * (1 - e),
      transform: [
        {
          translateX: -chip.dx * (1 - out) + sway + px + chip.dx * push * 0.9,
        },
        { translateY: -chip.dy * (1 - out) + bob + py + chip.dy * push * 0.9 },
        { scale: (0.2 + 0.8 * out) * (1 + push * 0.25) },
        { rotate: `${chip.tilt * out + sway * 0.6}deg` },
      ],
    }
  })

  return (
    <View
      style={{
        position: 'absolute',
        left: HUB.x + chip.dx - size / 2,
        top: HUB.y + chip.dy - size / 2,
        width: size,
        height: size,
      }}
    >
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size * 0.3,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: palette.surfaceBorder,
            backgroundColor: palette.surface,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: chip.color,
            shadowOpacity: palette.surfaceShadowOpacity.focus,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
          },
          style,
        ]}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size * 0.3,
              borderCurve: 'continuous',
              backgroundColor: withAlpha(chip.color, 0x26),
            },
          ]}
        />
        <LucideIcon
          icon={chip.icon}
          size={size * 0.46}
          color={chip.color}
          strokeWidth={2.2}
        />
      </Animated.View>
    </View>
  )
}

interface Props {
  /** Hub centre in screen points. */
  hub: { x: number; y: number }
  scale: number
  chips: RevealChip[]
  palette: WelcomePalette
  time: SharedValue<number>
  tilt: Tilt
  burst: SharedValue<number>
  exit: SharedValue<number>
  reduceMotion: boolean
}

/**
 * The new features, as icon chips that burst out of the app tile when its ring
 * closes and then float around it in parallax — a glance at everything the tour
 * is about to show.
 */
const RevealChips = ({
  hub,
  scale,
  chips,
  palette,
  time,
  tilt,
  burst,
  exit,
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
    {chips.map((chip, index) => (
      <Chip
        key={chip.id}
        chip={chip}
        index={index}
        palette={palette}
        time={time}
        tilt={tilt}
        burst={burst}
        exit={exit}
        reduceMotion={reduceMotion}
      />
    ))}
  </View>
)

export default RevealChips
