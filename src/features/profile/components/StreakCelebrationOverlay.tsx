import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native'
import { Canvas, Circle, RadialGradient, vec } from '@shopify/react-native-skia'
import { Flame as FlameIcon } from 'lucide-react-native'
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { STREAK_MIN, type StreakKind } from '@/lib/serviceStreak'

/** The beats of the celebration, in ms from opening. */
const T = {
  backdrop: 260,
  flame: 120,
  burst: 200,
  roll: 650,
  rollFor: 420,
  title: 900,
  caption: 1060,
  hold: 4200,
  exit: 320,
}
const STAGE = 220
/** The soft light behind the flame. */
const GLOW = 210
const NUMBER_HEIGHT = 88
const EASE_OUT = Easing.out(Easing.cubic)
const EMBER_COLORS = ['#FDE047', '#FB923C', '#F97316', '#FACC15']
/** Sparks thrown out of the flame, fixed so every celebration matches. */
const EMBERS = Array.from({ length: 16 }, (_, i) => ({
  angle: (i / 16) * Math.PI * 2 + (i % 2 ? 0.18 : -0.12),
  distance: 88 + ((i * 37) % 64),
  size: 5 + ((i * 13) % 5),
  color: EMBER_COLORS[i % EMBER_COLORS.length],
}))

// Always over a dark backdrop, whatever the theme.
const TEXT = '#FFFFFF'
const TEXT_DIM = 'rgba(255, 255, 255, 0.78)'

interface Props {
  count: number
  kind: StreakKind
  /** Gone from screen; unmount. */
  onDone: () => void
}

/**
 * The Service Streak reaching a milestone: the flame flares, sparks fly, and
 * the count rolls over to its new number. Tap anywhere to move on; it leaves on
 * its own after a few seconds.
 */
export default function StreakCelebrationOverlay({
  count,
  kind,
  onDone,
}: Props) {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const backdrop = useSharedValue(0)
  const flame = useSharedValue(reduceMotion ? 1 : 0)
  const wiggle = useSharedValue(0)
  const flicker = useSharedValue(0)
  const burst = useSharedValue(0)
  const roll = useSharedValue(reduceMotion ? 1 : 0)
  const title = useSharedValue(0)
  const caption = useSharedValue(0)
  const leaving = useRef(false)

  const headline = i18n.t(
    count === STREAK_MIN
      ? 'streakCelebration_started'
      : 'streakCelebration_grew'
  )
  const detail = i18n.t(
    kind === 'months'
      ? 'streakCelebration_captionMonths'
      : 'streakCelebration_captionPlans'
  )

  const leave = () => {
    if (leaving.current) return
    leaving.current = true
    // Done even if the fade is cut short, so it can't stay on screen.
    backdrop.value = withTiming(0, { duration: T.exit }, () => {
      scheduleOnRN(onDone)
    })
  }

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `${headline} ${i18n.t('streakAccessibilityLabel', { count })}`
    )
    // In, then out on its own unless a tap sends it off sooner.
    backdrop.value = withSequence(
      withTiming(1, { duration: T.backdrop, easing: EASE_OUT }),
      withDelay(
        T.hold - T.backdrop,
        withTiming(0, { duration: T.exit }, (finished) => {
          if (finished) scheduleOnRN(onDone)
        })
      )
    )
    title.value = withDelay(T.title, withTiming(1, { duration: 420 }))
    caption.value = withDelay(T.caption, withTiming(1, { duration: 420 }))
    const timers = [
      setTimeout(() => void Haptics.success().catch(() => {}), 160),
    ]
    if (!reduceMotion) {
      flame.value = withDelay(
        T.flame,
        withSpring(1, { damping: 9, stiffness: 140 })
      )
      wiggle.value = withDelay(
        T.flame,
        withSequence(
          withTiming(-1, { duration: 120 }),
          withTiming(0.8, { duration: 160 }),
          withTiming(-0.4, { duration: 140 }),
          withTiming(0, { duration: 160 })
        )
      )
      flicker.value = withDelay(
        T.title,
        withRepeat(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
          -1,
          true
        )
      )
      burst.value = withDelay(
        T.burst,
        withTiming(1, { duration: 1100, easing: EASE_OUT })
      )
      roll.value = withDelay(
        T.roll,
        withTiming(1, { duration: T.rollFor, easing: EASE_OUT })
      )
      timers.push(
        setTimeout(() => void Haptics.medium().catch(() => {}), T.roll)
      )
    }
    return () => timers.forEach(clearTimeout)
    // The host remounts it for each milestone, so this plays once.
  }, [
    backdrop,
    burst,
    caption,
    count,
    flame,
    flicker,
    headline,
    onDone,
    reduceMotion,
    roll,
    title,
    wiggle,
  ])

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }))
  const flameStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: flame.value * (1 + flicker.value * 0.05) },
      { scaleY: 1 + flicker.value * 0.04 },
      { rotate: `${wiggle.value * 10}deg` },
    ],
  }))
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + flicker.value * 0.25,
    transform: [{ scale: flame.value * (0.9 + flicker.value * 0.1) }],
  }))
  const titleStyle = useAnimatedStyle(() => ({
    opacity: title.value,
    transform: [{ translateY: (1 - title.value) * 14 }],
  }))
  const captionStyle = useAnimatedStyle(() => ({
    opacity: caption.value,
    transform: [{ translateY: (1 - caption.value) * 10 }],
  }))

  return (
    <FullWindowOverlay open onClose={leave}>
      <Animated.View
        accessibilityViewIsModal
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={leave}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('close')}
        />
        <View style={styles.content} pointerEvents='none'>
          <View style={styles.stage}>
            {!reduceMotion && (
              <>
                <Ring progress={burst} delay={0} />
                <Ring progress={burst} delay={0.22} />
                {EMBERS.map((ember, i) => (
                  <Ember key={i} {...ember} burst={burst} />
                ))}
              </>
            )}
            <Animated.View style={[styles.glow, glowStyle]}>
              <Canvas style={{ width: GLOW, height: GLOW }}>
                <Circle cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2}>
                  <RadialGradient
                    c={vec(GLOW / 2, GLOW / 2)}
                    r={GLOW / 2}
                    colors={[
                      'rgba(249, 115, 22, 0.85)',
                      'rgba(249, 115, 22, 0.3)',
                      'rgba(249, 115, 22, 0)',
                    ]}
                    positions={[0, 0.5, 1]}
                  />
                </Circle>
              </Canvas>
            </Animated.View>
            <Animated.View style={flameStyle}>
              <LucideIcon
                icon={FlameIcon}
                size={120}
                strokeWidth={1.6}
                color='#EA580C'
                fill='#F97316'
              />
              <View style={styles.innerFlame}>
                <LucideIcon
                  icon={FlameIcon}
                  size={56}
                  strokeWidth={1.4}
                  color='#FACC15'
                  fill='#FDE047'
                />
              </View>
            </Animated.View>
          </View>
          <Odometer from={count - 1} to={count} roll={roll} />
          <Animated.View style={titleStyle}>
            <Text style={[styles.title, { fontFamily: theme.fonts.bold }]}>
              {headline}
            </Text>
          </Animated.View>
          <Animated.View style={captionStyle}>
            <Text style={[styles.caption, { fontFamily: theme.fonts.medium }]}>
              {detail}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </FullWindowOverlay>
  )
}

/** The count, rolling up from the one before like an odometer. */
function Odometer({
  from,
  to,
  roll,
}: {
  from: number
  to: number
  roll: SharedValue<number>
}) {
  const theme = useTheme()
  const outStyle = useAnimatedStyle(() => ({
    opacity: 1 - roll.value,
    transform: [{ translateY: -roll.value * NUMBER_HEIGHT * 0.8 }],
  }))
  const inStyle = useAnimatedStyle(() => ({
    opacity: roll.value,
    transform: [
      { translateY: (1 - roll.value) * NUMBER_HEIGHT * 0.8 },
      // A pop as it lands.
      { scale: 1 + Math.sin(Math.PI * roll.value) * 0.18 },
    ],
  }))
  const number = [styles.number, { fontFamily: theme.fonts.bold }]
  return (
    <View style={styles.odometer}>
      {from > 0 && (
        <Animated.View style={[styles.digit, outStyle]}>
          <Text style={number}>{from.toLocaleString()}</Text>
        </Animated.View>
      )}
      <Animated.View style={[styles.digit, inStyle]}>
        <Text style={number}>{to.toLocaleString()}</Text>
      </Animated.View>
    </View>
  )
}

/** A ring of light spreading out from the flame. */
function Ring({
  progress,
  delay,
}: {
  progress: SharedValue<number>
  delay: number
}) {
  const style = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (progress.value - delay) / (1 - delay)))
    return {
      opacity: p > 0 ? 0.55 * (1 - p) : 0,
      transform: [{ scale: 0.45 + p * 1.6 }],
    }
  })
  return <Animated.View style={[styles.ring, style]} />
}

/** One spark, flying out and falling away as it fades. */
function Ember({
  angle,
  distance,
  size,
  color,
  burst,
}: (typeof EMBERS)[number] & { burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = burst.value
    return {
      opacity:
        p > 0 ? Math.min(1, p * 6) * (1 - Math.max(0, p - 0.55) / 0.45) : 0,
      transform: [
        { translateX: Math.cos(angle) * distance * p },
        { translateY: Math.sin(angle) * distance * p + 46 * p * p },
        { scale: 1 - p * 0.5 },
      ],
    }
  })
  return (
    <Animated.View
      style={[
        styles.ember,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(6, 8, 12, 0.88)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 6,
  },
  stage: {
    width: STAGE,
    height: STAGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: GLOW,
    height: GLOW,
  },
  innerFlame: {
    position: 'absolute',
    left: 32,
    top: 52,
  },
  ring: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: '#FDBA74',
  },
  ember: {
    position: 'absolute',
    left: STAGE / 2,
    top: STAGE / 2,
  },
  odometer: {
    height: NUMBER_HEIGHT,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  digit: {
    position: 'absolute',
  },
  number: {
    fontSize: 76,
    lineHeight: NUMBER_HEIGHT,
    color: TEXT,
    fontVariant: ['tabular-nums'],
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
    color: TEXT,
    marginTop: 6,
  },
  caption: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    color: TEXT_DIM,
    maxWidth: 320,
  },
})
