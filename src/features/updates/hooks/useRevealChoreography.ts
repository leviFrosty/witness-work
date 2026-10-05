import { useEffect, useRef, useState } from 'react'
import {
  Easing,
  SharedValue,
  useFrameCallback,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import Haptics from '@/lib/haptics'
import {
  EASE_COLLAPSE,
  EASE_IN,
  EASE_OUT,
  EXIT_MS,
  SPLASH_FADE_MS,
} from '@/features/onboarding/constants/welcome'
import {
  REVEAL_BURST_TOTAL_MS,
  REVEAL_CLOSE_MS,
  REVEAL_INTRO,
  REVEAL_REPLAY,
  REVEAL_TOUR_IN_MS,
  RevealTimeline,
} from '@/features/updates/constants/updateReveal'

/**
 * - `intro` — the first screen after launch: the splash collapses into the app
 *   tile, exactly as the onboarding welcome does.
 * - `calm` — that same moment under Reduce Motion: the splash simply fades.
 * - `replay` — opened later (the tray, What's New): the scene fades in over the
 *   app and the tile pops into place.
 */
export type RevealEntrance = 'intro' | 'calm' | 'replay'

/** The greeting, then the news. */
export type RevealHeadline = 'welcome' | 'news' | null

type Timers = { current: ReturnType<typeof setTimeout>[] }

// As in the onboarding welcome: wait for the UI thread to draw a run of frames
// on time before the intro plays, so a first-draw stall can't skip it. The
// splash replica covers the wait.
const SMOOTH_FRAMES = 6
const SMOOTH_FRAME_MS = 34
const SMOOTH_TIMEOUT_MS = 1500

const schedule = (timers: Timers, ms: number, run: () => void) => {
  timers.current.push(setTimeout(run, ms))
}

/**
 * Rings spread from the hub while the glow behind it swells and settles, once
 * at each of `times` (ms from now). Built as one sequence per value so a later
 * bloom doesn't cancel an earlier one still playing.
 */
const bloomAt = (
  ripple: SharedValue<number>,
  pulse: SharedValue<number>,
  times: number[]
) => {
  const rippleSteps: number[] = []
  const pulseSteps: number[] = []
  let rippleCursor = 0
  let pulseCursor = 0
  times.forEach((at, i) => {
    const next = times[i + 1] ?? Infinity
    rippleSteps.push(
      withTiming(0, { duration: 0 }),
      withDelay(
        Math.max(0, at - rippleCursor),
        withTiming(1, { duration: 1100, easing: EASE_OUT })
      )
    )
    rippleCursor = Math.max(rippleCursor, at) + 1100
    // The glow settles until the next bloom, however soon that comes.
    const settle = Math.max(1, Math.min(1400, next - at - 240))
    pulseSteps.push(
      withDelay(
        Math.max(0, at - pulseCursor),
        withTiming(1, { duration: 240 })
      ),
      withTiming(0.3, { duration: settle, easing: EASE_OUT })
    )
    pulseCursor = Math.max(pulseCursor, at) + 240 + settle
  })
  ripple.value = withSequence(...rippleSteps)
  pulse.value = withSequence(...pulseSteps)
}

interface StoryValues {
  reveal: SharedValue<number>
  orbits: SharedValue<number>
  ringEnd: SharedValue<number>
  tileSwell: SharedValue<number>
  ripple: SharedValue<number>
  pulse: SharedValue<number>
  burst: SharedValue<number>
  kicker: SharedValue<number>
  cta: SharedValue<number>
  link: SharedValue<number>
}

interface StoryCallbacks {
  timers: Timers
  setHeadline: (headline: RevealHeadline) => void
  /** The intro has played; tapping no longer hurries it. */
  onDone: () => void
}

/**
 * Plays everything after the tile is in place, from `t`'s offsets. `landAt` is
 * when the tile arrives, for its bloom.
 */
const playStory = (
  v: StoryValues,
  { timers, setHeadline, onDone }: StoryCallbacks,
  t: RevealTimeline,
  landAt: number
) => {
  v.reveal.value = withDelay(
    t.revealAt,
    withTiming(1, { duration: t.revealFor, easing: EASE_OUT })
  )
  v.orbits.value = withDelay(
    t.orbitsAt,
    withTiming(1, { duration: t.orbitsFor, easing: EASE_OUT })
  )
  // The ring closes like an install finishing; the tile swells as it meets
  // itself, and the new features burst out.
  v.ringEnd.value = withDelay(
    t.ringAt,
    withTiming(1, { duration: t.ringFor, easing: Easing.inOut(Easing.cubic) })
  )
  const closeAt = t.ringAt + t.ringFor - 80
  v.tileSwell.value = withDelay(
    closeAt,
    withSequence(
      withTiming(1.08, { duration: 200, easing: EASE_OUT }),
      withSpring(1, { damping: 10, stiffness: 200 })
    )
  )
  bloomAt(v.ripple, v.pulse, [landAt, closeAt])
  v.burst.value = withDelay(
    t.burstAt,
    withTiming(1, { duration: REVEAL_BURST_TOTAL_MS, easing: Easing.linear })
  )
  v.kicker.value = withDelay(
    t.kickerAt,
    withTiming(1, { duration: 600, easing: EASE_OUT })
  )
  v.cta.value = withDelay(
    t.ctaAt,
    withSpring(1, { damping: 16, stiffness: 140 })
  )
  v.link.value = withDelay(t.linkAt, withTiming(1, { duration: 500 }))
  schedule(timers, t.headlineAt, () => setHeadline('welcome'))
  schedule(timers, t.newsAt, () => setHeadline('news'))
  schedule(timers, closeAt, () => Haptics.medium())
  schedule(timers, t.doneAt, onDone)
}

interface Options {
  entrance: RevealEntrance
  /** The stage is measured, so the tile knows where to land. */
  ready: boolean
}

/**
 * Sequences the update reveal: the tile arrives (from the splash at launch),
 * its ring closes like an install finishing, the new features burst out around
 * it, and the greeting gives way to the news. Then the hand-off to the tour,
 * and the way out. Like the onboarding welcome, everything time-critical is
 * scheduled on the UI thread from a single moment so launch work on the JS
 * thread can't knock the choreography apart.
 */
const useRevealChoreography = ({ entrance, ready }: Options) => {
  const [splashVisible, setSplashVisible] = useState(entrance !== 'replay')
  const [headline, setHeadline] = useState<RevealHeadline>(null)
  const [introDone, setIntroDone] = useState(false)
  const [phase, setPhase] = useState<'intro' | 'tour'>('intro')
  const [settled, setSettled] = useState(false)
  const [closing, setClosing] = useState(false)

  /** 0 = the full-screen splash, 1 = the settled app tile. */
  const collapse = useSharedValue(entrance === 'intro' ? 0 : 1)
  /** Opacity of the splash replica laid over everything at launch. */
  const splash = useSharedValue(1)
  /** 0–1 reveal of the aurora behind everything. */
  const reveal = useSharedValue(0)
  const orbits = useSharedValue(0)
  /** Orbits and ring; they clear away for the tour, the aurora stays. */
  const chrome = useSharedValue(1)
  const ringStart = useSharedValue(0)
  const ringEnd = useSharedValue(0)
  const pulse = useSharedValue(0)
  const ripple = useSharedValue(0)
  /** The tile's arrival: a landing squash, or a replay's pop. */
  const tileLand = useSharedValue(entrance === 'replay' ? 0.4 : 1)
  /** The tile's swell as its ring closes. */
  const tileSwell = useSharedValue(1)
  const tileScale = useDerivedValue(() => tileLand.value * tileSwell.value)
  /** 0–1 run of the feature chips flying out of the hub. */
  const burst = useSharedValue(0)
  const kicker = useSharedValue(0)
  const cta = useSharedValue(0)
  const link = useSharedValue(0)
  /** 0–1 the intro clears away for the tour. */
  const exit = useSharedValue(0)
  /** 0–1 the tour settles in. */
  const tour = useSharedValue(0)
  /** 1 = the whole overlay is hidden; a replay fades in from it. */
  const veil = useSharedValue(entrance === 'replay' ? 1 : 0)

  const smoothFrames = useSharedValue(0)
  const settleGate = useFrameCallback(
    ({ timeSincePreviousFrame, timeSinceFirstFrame }) => {
      'worklet'
      if (smoothFrames.value < 0) return
      const onTime = (timeSincePreviousFrame ?? Infinity) < SMOOTH_FRAME_MS
      smoothFrames.value = onTime ? smoothFrames.value + 1 : 0
      if (
        smoothFrames.value >= SMOOTH_FRAMES ||
        timeSinceFirstFrame > SMOOTH_TIMEOUT_MS
      ) {
        smoothFrames.value = -1
        scheduleOnRN(setSettled, true)
      }
    },
    false
  )

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const started = useRef(false)
  useEffect(() => {
    const pending = timers.current
    return () => pending.splice(0).forEach(clearTimeout)
  }, [])

  // Start once the stage is measured — the tile needs to know where to land.
  useEffect(() => {
    if (!ready || started.current) return
    if (entrance === 'intro') {
      settleGate.setActive(true)
      return
    }
    started.current = true
    if (entrance === 'calm') {
      // Under Reduce Motion, nothing travels: the scene is in place and the
      // splash fades off it.
      for (const value of [reveal, orbits, burst, kicker, cta, link]) {
        value.value = 1
      }
      ringEnd.value = 1
      splash.value = withTiming(0, { duration: SPLASH_FADE_MS })
      setHeadline('welcome')
      schedule(timers, REVEAL_INTRO.newsAt - REVEAL_INTRO.headlineAt, () =>
        setHeadline('news')
      )
      schedule(timers, SPLASH_FADE_MS, () => {
        setSplashVisible(false)
        setIntroDone(true)
      })
      return
    }
    // A replay fades in over the app, then the tile pops into place.
    veil.value = withTiming(0, { duration: 320, easing: EASE_OUT })
    tileLand.value = withDelay(
      120,
      withSpring(1, { damping: 11, stiffness: 180 })
    )
    playStory(
      {
        reveal,
        orbits,
        ringEnd,
        tileSwell,
        ripple,
        pulse,
        burst,
        kicker,
        cta,
        link,
      },
      {
        timers,
        setHeadline,
        onDone: () => {
          setSplashVisible(false)
          setIntroDone(true)
        },
      },
      REVEAL_REPLAY,
      220
    )
  }, [
    ready,
    entrance,
    settleGate,
    veil,
    tileLand,
    tileSwell,
    ripple,
    pulse,
    reveal,
    orbits,
    burst,
    kicker,
    cta,
    link,
    ringEnd,
    splash,
  ])

  // Launch: play the intro once the scene is drawing smoothly.
  useEffect(() => {
    if (!settled || started.current) return
    started.current = true
    settleGate.setActive(false)
    const t = REVEAL_INTRO
    const landAt = t.collapseAt + t.collapseFor - 60
    // The splash replica hands over to the curtain as it starts to move.
    splash.value = withDelay(t.collapseAt, withTiming(0, { duration: 0 }))
    collapse.value = withDelay(
      t.collapseAt,
      withTiming(1, { duration: t.collapseFor, easing: EASE_COLLAPSE })
    )
    // The tile lands: a squash, a ripple and a bloom (and a tap).
    tileLand.value = withDelay(
      landAt,
      withSequence(
        withTiming(0.9, { duration: 110, easing: EASE_OUT }),
        withSpring(1, { damping: 9, stiffness: 240 })
      )
    )
    schedule(timers, landAt, () => Haptics.light())
    playStory(
      {
        reveal,
        orbits,
        ringEnd,
        tileSwell,
        ripple,
        pulse,
        burst,
        kicker,
        cta,
        link,
      },
      {
        timers,
        setHeadline,
        onDone: () => {
          setSplashVisible(false)
          setIntroDone(true)
        },
      },
      t,
      landAt
    )
  }, [
    settled,
    settleGate,
    splash,
    collapse,
    tileLand,
    tileSwell,
    ripple,
    pulse,
    reveal,
    orbits,
    burst,
    kicker,
    cta,
    link,
    ringEnd,
  ])

  /** A tap on the scene hurries the intro to its end state. */
  const skipIntro = () => {
    if (!started.current || introDone) return
    timers.current.splice(0).forEach(clearTimeout)
    const quick = { duration: 240, easing: EASE_OUT }
    splash.value = 0
    collapse.value = withTiming(1, quick)
    tileLand.value = withTiming(1, quick)
    tileSwell.value = withTiming(1, quick)
    for (const value of [reveal, orbits, kicker, cta, link, ringEnd]) {
      value.value = withTiming(1, quick)
    }
    burst.value = withTiming(1, { duration: 360, easing: Easing.linear })
    setHeadline('news')
    setSplashVisible(false)
    setIntroDone(true)
  }

  /** Clears the intro away and brings in the tour. */
  const startTour = () => {
    // A press before the buttons have faded in just hurries the intro.
    if (cta.value < 0.5) {
      skipIntro()
      return
    }
    if (phase === 'tour' || closing) return
    timers.current.splice(0).forEach(clearTimeout)
    exit.value = withTiming(1, { duration: EXIT_MS, easing: EASE_IN })
    chrome.value = withTiming(0, { duration: EXIT_MS + 120 })
    schedule(timers, EXIT_MS, () => {
      setPhase('tour')
      tour.value = withTiming(1, {
        duration: REVEAL_TOUR_IN_MS,
        easing: EASE_OUT,
      })
    })
  }

  /** Fades the whole overlay out, then hands control back. */
  const close = (then: () => void) => {
    if (closing) return
    setClosing(true)
    timers.current.splice(0).forEach(clearTimeout)
    veil.value = withTiming(1, { duration: REVEAL_CLOSE_MS, easing: EASE_IN })
    schedule(timers, REVEAL_CLOSE_MS, then)
  }

  return {
    values: {
      collapse,
      splash,
      reveal,
      orbits,
      chrome,
      ringStart,
      ringEnd,
      pulse,
      ripple,
      tileScale,
      burst,
      kicker,
      cta,
      link,
      exit,
      tour,
      veil,
    },
    phase,
    headline,
    splashVisible,
    /** Tapping the scene can hurry the intro along. */
    skippable: phase === 'intro' && !introDone,
    skipIntro,
    startTour,
    close,
  }
}

export default useRevealChoreography
