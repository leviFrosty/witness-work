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

export type RevealEntrance = 'intro' | 'calm' | 'replay'

export type RevealHeadline = 'welcome' | 'news' | null

type Timers = { current: ReturnType<typeof setTimeout>[] }

const SMOOTH_FRAMES = 6
const SMOOTH_FRAME_MS = 34
const SMOOTH_TIMEOUT_MS = 1500

const schedule = (timers: Timers, ms: number, run: () => void) => {
  timers.current.push(setTimeout(run, ms))
}

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

  onDone: () => void
}

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

  ready: boolean
}

const useRevealChoreography = ({ entrance, ready }: Options) => {
  const [splashVisible, setSplashVisible] = useState(entrance !== 'replay')
  const [headline, setHeadline] = useState<RevealHeadline>(null)
  const [introDone, setIntroDone] = useState(false)
  const [phase, setPhase] = useState<'intro' | 'tour'>('intro')
  const [settled, setSettled] = useState(false)
  const [closing, setClosing] = useState(false)

  const collapse = useSharedValue(entrance === 'intro' ? 0 : 1)

  const splash = useSharedValue(1)

  const reveal = useSharedValue(0)
  const orbits = useSharedValue(0)

  const chrome = useSharedValue(1)
  const ringStart = useSharedValue(0)
  const ringEnd = useSharedValue(0)
  const pulse = useSharedValue(0)
  const ripple = useSharedValue(0)

  const tileLand = useSharedValue(entrance === 'replay' ? 0.4 : 1)

  const tileSwell = useSharedValue(1)
  const tileScale = useDerivedValue(() => tileLand.value * tileSwell.value)

  const burst = useSharedValue(0)
  const kicker = useSharedValue(0)
  const cta = useSharedValue(0)
  const link = useSharedValue(0)

  const exit = useSharedValue(0)

  const tour = useSharedValue(0)

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

  useEffect(() => {
    if (!ready || started.current) return
    if (entrance === 'intro') {
      settleGate.setActive(true)
      return
    }
    started.current = true
    if (entrance === 'calm') {
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

  useEffect(() => {
    if (!settled || started.current) return
    started.current = true
    settleGate.setActive(false)
    const t = REVEAL_INTRO
    const landAt = t.collapseAt + t.collapseFor - 60

    splash.value = withDelay(t.collapseAt, withTiming(0, { duration: 0 }))
    collapse.value = withDelay(
      t.collapseAt,
      withTiming(1, { duration: t.collapseFor, easing: EASE_COLLAPSE })
    )

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

  const startTour = () => {
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

    skippable: phase === 'intro' && !introDone,
    skipIntro,
    startTour,
    close,
  }
}

export default useRevealChoreography
