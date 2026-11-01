import { useEffect, useRef, useState } from 'react'
import {
  Easing,
  SharedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { isLaunching } from '@/app/launch/launchState'

import Haptics from '@/lib/haptics'
import {
  BURST_TOTAL_MS,
  EASE_COLLAPSE,
  EASE_IN,
  EASE_OUT,
  EXIT_MS,
  Headline,
  INTRO,
  PILLARS,
  PILLAR_HOLD_MS,
  RETURN_MS,
  RING_START,
  SPLASH_FADE_MS,
  STORY_CYCLES,
  WELCOME_HOLD_MS,
} from '@/features/onboarding/constants/welcome'

export type Entrance = 'intro' | 'calm' | 'return'

type Timers = { current: ReturnType<typeof setTimeout>[] }

const SMOOTH_FRAMES = 6
const SMOOTH_FRAME_MS = 34
const SMOOTH_TIMEOUT_MS = 1500

const schedule = (timers: Timers, ms: number, run: () => void) => {
  timers.current.push(setTimeout(run, ms))
}

const bloom = (
  ripple: SharedValue<number>,
  pulse: SharedValue<number>,
  delay = 0
) => {
  ripple.value = withSequence(
    withTiming(0, { duration: 0 }),
    withDelay(delay, withTiming(1, { duration: 1100, easing: EASE_OUT }))
  )
  pulse.value = withSequence(
    withDelay(delay, withTiming(1, { duration: 240 })),
    withTiming(0.3, { duration: 1400, easing: EASE_OUT })
  )
}

const ringFill = (headline: Headline) => {
  const index = PILLARS.findIndex((pillar) => pillar.id === headline)
  return index < 0 ? null : (index + 1) / PILLARS.length
}

interface Options {
  ready: boolean
  reduceMotion: boolean

  isFocused: boolean
}

const useWelcomeChoreography = ({
  ready,
  reduceMotion,
  isFocused,
}: Options) => {
  const [entrance] = useState<Entrance>(() =>
    !isLaunching() ? 'return' : reduceMotion ? 'calm' : 'intro'
  )
  const [splashVisible, setSplashVisible] = useState(entrance !== 'return')
  const [headline, setHeadline] = useState<Headline>(null)
  const [introDone, setIntroDone] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [storyDone, setStoryDone] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [settled, setSettled] = useState(false)

  const collapse = useSharedValue(entrance === 'intro' ? 0 : 1)

  const splash = useSharedValue(1)

  const reveal = useSharedValue(0)
  const orbits = useSharedValue(0)

  const burst = useSharedValue(0)
  const ripple = useSharedValue(0)
  const tileScale = useSharedValue(1)
  const pulse = useSharedValue(0)
  const ringStart = useSharedValue(0)
  const ringEnd = useSharedValue(0)
  const subtitle = useSharedValue(0)
  const cta = useSharedValue(0)
  const link = useSharedValue(0)

  const exit = useSharedValue(entrance === 'return' ? 1 : 0)

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
  const storyCycles = useRef(0)
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
    for (const value of [reveal, orbits, burst, subtitle, cta, link]) {
      value.value = 1
    }
    ringEnd.value = RING_START
    if (entrance === 'calm') {
      splash.value = withTiming(0, { duration: SPLASH_FADE_MS })
    } else {
      exit.value = withTiming(0, { duration: RETURN_MS, easing: EASE_OUT })
    }
    schedule(timers, 0, () => {
      setHeadline('welcome')
      setIntroDone(true)
    })
    schedule(timers, SPLASH_FADE_MS, () => setSplashVisible(false))
  }, [
    ready,
    entrance,
    settleGate,
    splash,
    reveal,
    orbits,
    ringEnd,
    burst,
    subtitle,
    cta,
    link,
    exit,
  ])

  useEffect(() => {
    if (!settled || started.current) return
    started.current = true
    settleGate.setActive(false)
    const t = INTRO
    const landAt = t.collapseAt + t.collapseFor - 60

    splash.value = withDelay(t.collapseAt, withTiming(0, { duration: 0 }))
    collapse.value = withDelay(
      t.collapseAt,
      withTiming(1, { duration: t.collapseFor, easing: EASE_COLLAPSE })
    )
    reveal.value = withDelay(
      t.collapseAt,
      withTiming(1, { duration: t.revealFor, easing: EASE_OUT })
    )

    tileScale.value = withDelay(
      landAt,
      withSequence(
        withTiming(0.9, { duration: 110, easing: EASE_OUT }),
        withSpring(1, { damping: 9, stiffness: 240 })
      )
    )
    bloom(ripple, pulse, landAt)
    orbits.value = withDelay(
      t.orbitsAt,
      withTiming(1, { duration: t.orbitsFor, easing: EASE_OUT })
    )
    ringEnd.value = withDelay(
      t.orbitsAt,
      withTiming(RING_START, { duration: t.orbitsFor, easing: EASE_OUT })
    )
    burst.value = withDelay(
      t.burstAt,
      withTiming(1, { duration: BURST_TOTAL_MS, easing: Easing.linear })
    )
    subtitle.value = withDelay(
      t.subtitleAt,
      withTiming(1, { duration: 600, easing: EASE_OUT })
    )
    cta.value = withDelay(
      t.ctaAt,
      withSpring(1, { damping: 16, stiffness: 140 })
    )
    link.value = withDelay(t.linkAt, withTiming(1, { duration: 500 }))

    setHeadline('welcome')
    schedule(timers, landAt, () => Haptics.light())
    schedule(timers, t.doneAt, () => {
      setSplashVisible(false)
      setIntroDone(true)
    })
  }, [
    settled,
    settleGate,
    splash,
    collapse,
    reveal,
    orbits,
    ringEnd,
    burst,
    subtitle,
    cta,
    link,
    ripple,
    tileScale,
    pulse,
  ])

  useEffect(() => {
    if (!introDone || leaving || !isFocused || !headline || storyDone) return
    const id = setTimeout(
      () => {
        const index = PILLARS.findIndex((pillar) => pillar.id === headline)
        if (index < PILLARS.length - 1) {
          setHeadline(PILLARS[index + 1].id)
          return
        }
        storyCycles.current += 1
        if (storyCycles.current >= (reduceMotion ? 1 : STORY_CYCLES)) {
          setStoryDone(true)
          setHeadline('welcome')
          return
        }
        setHeadline(PILLARS[0].id)
      },
      headline === 'welcome' ? WELCOME_HOLD_MS : PILLAR_HOLD_MS
    )
    return () => clearTimeout(id)
  }, [introDone, leaving, isFocused, headline, storyDone, reduceMotion])

  useEffect(() => {
    const fill = ringFill(headline)
    if (fill === null) return
    if (fill < ringEnd.value) {
      ringStart.value = withTiming(
        1,
        { duration: 600, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (!finished) return
          ringStart.value = 0
          ringEnd.value = 0
          ringEnd.value = withTiming(fill, { duration: 800, easing: EASE_OUT })
        }
      )
      return
    }
    ringEnd.value = withTiming(fill, { duration: 900, easing: EASE_OUT })
    if (fill < 1) return

    tileScale.value = withDelay(
      700,
      withSequence(
        withTiming(1.06, { duration: 200, easing: EASE_OUT }),
        withSpring(1, { damping: 10, stiffness: 200 })
      )
    )
    bloom(ripple, pulse, 700)
  }, [headline, ringStart, ringEnd, ripple, pulse, tileScale])

  const skipIntro = () => {
    if (!started.current || introDone) return

    timers.current.splice(0).forEach(clearTimeout)
    const quick = { duration: 240, easing: EASE_OUT }
    splash.value = 0
    collapse.value = withTiming(1, quick)
    for (const value of [reveal, orbits, subtitle, cta, link]) {
      value.value = withTiming(1, quick)
    }
    burst.value = withTiming(1, { duration: 360, easing: Easing.linear })
    ringEnd.value = withTiming(RING_START, quick)
    setSkipped(true)
    setSplashVisible(false)
    setIntroDone(true)
  }

  const leave = (next: () => void) => {
    if (cta.value < 0.5) {
      skipIntro()
      return
    }
    if (leaving) return
    setLeaving(true)
    exit.value = withTiming(1, { duration: EXIT_MS, easing: EASE_IN })
    schedule(timers, EXIT_MS, next)
  }

  return {
    values: {
      collapse,
      splash,
      reveal,
      orbits,
      burst,
      ripple,
      tileScale,
      pulse,
      ringStart,
      ringEnd,
      subtitle,
      cta,
      link,
      exit,
    },
    headline,

    firstLineDelay: entrance === 'intro' && !skipped ? INTRO.headlineAt : 0,
    splashVisible,

    skippable: entrance === 'intro' && !introDone,
    skipIntro,
    leave,
  }
}

export default useWelcomeChoreography
