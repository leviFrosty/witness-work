import { useCallback, useEffect, useRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import Text from '@/components/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Haptics from '@/lib/haptics'
import useFireworks from '@/hooks/useFireworks'
import ActionButton from '@/components/ActionButton'
import Button from '@/components/Button'

interface Props {
  /** Whether the reveal is currently presented. */
  show: boolean
  /** Called whenever the overlay should be dismissed (skip OR CTA). */
  onDismiss: () => void
  /** Called when the user taps the "See what's new" CTA. */
  onSeeWhatsNew: () => void
}

/**
 * Choreographed timings for the grand-reveal sequence. Adjust here rather than
 * inline so the haptic / confetti scheduling stays in lockstep with the
 * Reanimated values driving the visuals.
 */
const TIMING = {
  /** Backdrop fade-in. */
  backdropDuration: 320,
  /** "Welcome back" appears, then peels away. */
  welcomeDelay: 250,
  welcomeDuration: 500,
  welcomeHold: 700,
  /** Title rises in big. */
  titleDelay: 1450,
  titleDuration: 750,
  /** Tagline + version subtext fade in beneath the title. */
  taglineDelay: 2350,
  taglineDuration: 600,
  /** CTAs slide up at the end. */
  ctaDelay: 3300,
  ctaDuration: 600,
  /** Stagger between heavy haptic taps during the title hit. */
  hapticStaggerMs: 140,
} as const

/** Opening burst — modest, slow drift to set the scene before the title hits. */
const OPENING_BURST_OPTS = {
  count: 22,
  velocity: 200,
  staggerMs: 320,
  spots: [
    { x: 0.22, y: 0.28 },
    { x: 0.78, y: 0.28 },
    { x: 0.5, y: 0.2 },
  ],
}

/**
 * Title-hit burst — dense cluster framing the title so the moment lands hard.
 * Heavier count + tighter spots concentrated around the title band.
 */
const TITLE_BURST_OPTS = {
  count: 44,
  velocity: 220,
  staggerMs: 180,
  spots: [
    { x: 0.12, y: 0.34 },
    { x: 0.88, y: 0.34 },
    { x: 0.22, y: 0.46 },
    { x: 0.78, y: 0.46 },
    { x: 0.5, y: 0.3 },
    { x: 0.38, y: 0.52 },
    { x: 0.62, y: 0.52 },
    { x: 0.5, y: 0.6 },
  ],
}

/**
 * Ambient burst — small, quiet pops that play after the choreography ends so
 * the screen keeps a low-key celebratory shimmer while the user reads the
 * CTAs.
 */
const AMBIENT_BURST_OPTS = {
  count: 10,
  velocity: 150,
  staggerMs: 480,
  spots: [
    { x: 0.15, y: 0.2 },
    { x: 0.85, y: 0.25 },
    { x: 0.5, y: 0.15 },
  ],
}

/** Total ambient bursts after the main animation, and the gap between them. */
const AMBIENT_COUNT = 5
const AMBIENT_INTERVAL_MS = 1100

/**
 * Full-screen modal that plays a one-shot celebratory reveal for The Milestone
 * Update. Fires confetti, heavy haptics, and a fade-in title sequence. Tap
 * anywhere skips straight to dismiss; the primary CTA hands off to the showcase
 * screen via `onSeeWhatsNew`.
 *
 * Mount this above the rest of the app (e.g. in HomeTabStack) and gate
 * presentation on the version + preference flags.
 */
const MilestoneRevealOverlay = ({ show, onDismiss, onSeeWhatsNew }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const fireworks = useFireworks()

  const backdropOpacity = useSharedValue(0)
  const welcomeOpacity = useSharedValue(0)
  const welcomeTranslateY = useSharedValue(12)
  const titleOpacity = useSharedValue(0)
  const titleScale = useSharedValue(0.78)
  const titleTranslateY = useSharedValue(28)
  const taglineOpacity = useSharedValue(0)
  const taglineTranslateY = useSharedValue(14)
  const ctaOpacity = useSharedValue(0)
  const ctaTranslateY = useSharedValue(28)

  const playedRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t))
    timersRef.current = []
  }, [])

  useEffect(() => {
    if (!show) {
      // Reset state for the next play (e.g. user re-opens via shaking present).
      playedRef.current = false
      clearTimers()
      backdropOpacity.value = 0
      welcomeOpacity.value = 0
      welcomeTranslateY.value = 12
      titleOpacity.value = 0
      titleScale.value = 0.78
      titleTranslateY.value = 28
      taglineOpacity.value = 0
      taglineTranslateY.value = 14
      ctaOpacity.value = 0
      ctaTranslateY.value = 28
      return
    }
    if (playedRef.current) return
    playedRef.current = true

    const easeOut = Easing.out(Easing.cubic)

    // Backdrop fades in immediately.
    backdropOpacity.value = withTiming(1, {
      duration: TIMING.backdropDuration,
      easing: easeOut,
    })

    // "Welcome back" — small, peels away. Chain via withSequence so the
    // fade-out doesn't clobber the fade-in (a bare reassignment would).
    welcomeOpacity.value = withDelay(
      TIMING.welcomeDelay,
      withSequence(
        withTiming(1, { duration: TIMING.welcomeDuration, easing: easeOut }),
        withDelay(
          TIMING.welcomeHold,
          withTiming(0, { duration: 400, easing: easeOut })
        )
      )
    )
    welcomeTranslateY.value = withDelay(
      TIMING.welcomeDelay,
      withTiming(0, { duration: TIMING.welcomeDuration, easing: easeOut })
    )

    // Title — big drop-in with spring scale.
    titleOpacity.value = withDelay(
      TIMING.titleDelay,
      withTiming(1, { duration: TIMING.titleDuration, easing: easeOut })
    )
    titleTranslateY.value = withDelay(
      TIMING.titleDelay,
      withTiming(0, { duration: TIMING.titleDuration, easing: easeOut })
    )
    titleScale.value = withDelay(
      TIMING.titleDelay,
      withSpring(1, { damping: 14, stiffness: 110 })
    )

    // Tagline + version line.
    taglineOpacity.value = withDelay(
      TIMING.taglineDelay,
      withTiming(1, { duration: TIMING.taglineDuration, easing: easeOut })
    )
    taglineTranslateY.value = withDelay(
      TIMING.taglineDelay,
      withTiming(0, { duration: TIMING.taglineDuration, easing: easeOut })
    )

    // CTAs.
    ctaOpacity.value = withDelay(
      TIMING.ctaDelay,
      withTiming(1, { duration: TIMING.ctaDuration, easing: easeOut })
    )
    ctaTranslateY.value = withDelay(
      TIMING.ctaDelay,
      withTiming(0, { duration: TIMING.ctaDuration, easing: easeOut })
    )

    // Confetti — opening burst sets the stage, title burst is heavier and
    // framed around the title, then ambient bursts keep a soft background
    // shimmer going after the main choreography lands.
    timersRef.current.push(
      setTimeout(() => fireworks.fire(OPENING_BURST_OPTS), 120)
    )
    timersRef.current.push(
      setTimeout(() => fireworks.fire(TITLE_BURST_OPTS), TIMING.titleDelay)
    )
    const ambientStart = TIMING.ctaDelay + TIMING.ctaDuration + 200
    for (let i = 0; i < AMBIENT_COUNT; i++) {
      timersRef.current.push(
        setTimeout(
          () => fireworks.fire(AMBIENT_BURST_OPTS),
          ambientStart + i * AMBIENT_INTERVAL_MS
        )
      )
    }

    // Haptics — success burst at backdrop, then a heavy 3-pulse cluster on the
    // title hit so the moment feels physical. All wrapped in catch so a missing
    // haptic engine (simulator) never crashes.
    timersRef.current.push(
      setTimeout(() => Haptics.success().catch(() => {}), 80)
    )
    for (let i = 0; i < 3; i++) {
      timersRef.current.push(
        setTimeout(
          () => Haptics.heavy().catch(() => {}),
          TIMING.titleDelay + i * TIMING.hapticStaggerMs
        )
      )
    }

    return clearTimers
  }, [
    show,
    backdropOpacity,
    welcomeOpacity,
    welcomeTranslateY,
    titleOpacity,
    titleScale,
    titleTranslateY,
    taglineOpacity,
    taglineTranslateY,
    ctaOpacity,
    ctaTranslateY,
    fireworks,
    clearTimers,
  ])

  const handleSkip = useCallback(() => {
    clearTimers()
    onDismiss()
  }, [clearTimers, onDismiss])

  const handleSeeWhatsNew = useCallback(() => {
    clearTimers()
    onSeeWhatsNew()
  }, [clearTimers, onSeeWhatsNew])

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))
  const welcomeStyle = useAnimatedStyle(() => ({
    opacity: welcomeOpacity.value,
    transform: [{ translateY: welcomeTranslateY.value }],
  }))
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [
      { translateY: titleTranslateY.value },
      { scale: titleScale.value },
    ],
  }))
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineTranslateY.value }],
  }))
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaTranslateY.value }],
  }))

  if (!show) return null

  return (
    <Animated.View
      pointerEvents='auto'
      style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropStyle]}
    >
      {/* Tap-anywhere skip target. Sits behind the content so the CTAs catch
          their own presses without colliding with the dismiss handler. */}
      <Pressable style={StyleSheet.absoluteFillObject} onPress={handleSkip} />

      <View style={[styles.content, { paddingTop: insets.top + 80 }]}>
        <Animated.View style={welcomeStyle} pointerEvents='none'>
          <Text style={[styles.welcome, { fontFamily: theme.fonts.medium }]}>
            {i18n.t('milestoneReveal_welcomeBack')}
          </Text>
        </Animated.View>

        <View style={styles.titleArea} pointerEvents='none'>
          <Animated.View style={titleStyle}>
            <Text style={[styles.title, { fontFamily: theme.fonts.bold }]}>
              {i18n.t('milestoneReveal_title')}
            </Text>
          </Animated.View>

          <Animated.View style={taglineStyle}>
            <Text style={styles.tagline}>
              {i18n.t('milestoneReveal_tagline')}
            </Text>
            <Text style={styles.version}>
              {`v${Constants.expoConfig?.version ?? ''}`}
            </Text>
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.ctaArea,
            { paddingBottom: insets.bottom + 40 },
            ctaStyle,
          ]}
        >
          <ActionButton onPress={handleSeeWhatsNew}>
            {i18n.t('milestoneReveal_seeWhatsNew')}
          </ActionButton>
          <Button onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipLabel}>
              {i18n.t('milestoneReveal_notNow')}
            </Text>
          </Button>
        </Animated.View>
      </View>
    </Animated.View>
  )
}

/**
 * The overlay's backdrop is always dark regardless of theme, so all text colors
 * are pinned to white-on-dark here rather than reading
 * `theme.colors.textInverse` (which inverts based on system theme — wrong for a
 * fixed-dark surface).
 */
const TEXT_PRIMARY = '#FFFFFF'
const TEXT_DIM = 'rgba(255, 255, 255, 0.78)'
const TEXT_FAINT = 'rgba(255, 255, 255, 0.5)'

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#06080C',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  welcome: {
    fontSize: 15,
    textAlign: 'center',
    letterSpacing: 2.4,
    color: TEXT_DIM,
  },
  titleArea: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 46,
    lineHeight: 54,
    textAlign: 'center',
    letterSpacing: -1.2,
    color: TEXT_PRIMARY,
  },
  tagline: {
    fontSize: 16,
    textAlign: 'center',
    color: TEXT_DIM,
    marginTop: 4,
  },
  version: {
    fontSize: 12,
    textAlign: 'center',
    color: TEXT_FAINT,
    marginTop: 8,
    letterSpacing: 1.2,
  },
  ctaArea: {
    gap: 12,
    paddingHorizontal: 4,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipLabel: {
    color: TEXT_DIM,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})

export default MilestoneRevealOverlay
