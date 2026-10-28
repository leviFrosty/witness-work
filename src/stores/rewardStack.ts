import type { ReactNode, RefObject } from 'react'
import { AccessibilityInfo, type View } from 'react-native'
import { create } from 'zustand'
import {
  playRewardSound,
  prepareRewardSounds,
  releaseRewardSounds,
  semitones,
} from '@/lib/audio'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import { usePreferences } from '@/stores/preferences'

/**
 * The reward stack: what a save earned, played as a combo where the User is
 * (`docs/toasts.md`). Each line stomps in with a hit, a running total climbs,
 * slams, then drops into the wallet it lands in and counts up. Lines from saves
 * made while it plays join the same combo. A feature builds the lines
 * (`startReward`); shared so the toast, the streak celebration and the pet card
 * can each draw it (`RewardStackLayer`) without importing that feature.
 */

/** How a line looks and hits: a plain day, a bonus, a streak milestone. */
export type RewardTone = 'base' | 'bonus' | 'milestone'

export type RewardLine = {
  amount: number
  /** What earned it: "Time added", "Planned day kept". */
  label: string
  tone: RewardTone
  /**
   * Play it in the streak celebration about to open (`claimRewardSlot`), and
   * wait for it a moment.
   */
  celebration?: boolean
}

/**
 * Where a run draws: above the save's toast, inside the streak celebration, or
 * over the pet's card for what was earned elsewhere.
 */
export type RewardSlot = 'toast' | 'celebration' | 'card'

/** The wallet count the run lands in, from what it showed to what it ends on. */
export type RewardCount = { from: number; to: number }

export type RewardRunInput = {
  slot: 'toast' | 'card'
  lines: RewardLine[]
  count: RewardCount
  /** The currency's icon, `size` points square. */
  icon: (size: number) => ReactNode
  /** Read out in its place with a screen reader: "Earned 5 coins". */
  announcement: string
}

/**
 * - `play`: lines stomping in, one after another.
 * - `hold`: waiting for the streak celebration to open for the next line.
 * - `slam`: the total's last hit, then the lines fall away.
 * - `fly`: the total drops into its wallet count.
 * - `count`: the wallet counts up.
 */
export type RewardPhase = 'play' | 'hold' | 'slam' | 'fly' | 'count'

export type RewardRun = Omit<RewardRunInput, 'slot'> & {
  id: number
  /** Where it draws now. */
  slot: RewardSlot
  /** Where it goes back to when the celebration closes. */
  home: 'toast' | 'card'
  phase: RewardPhase
  /** Lines on screen so far: the first `played`. */
  played: number
  /** The count as shown now. */
  shown: number
  /** One small line: it rises with a tick, nothing stomps or shakes. */
  soft: boolean
}

type RewardStackState = { run: RewardRun | null }

export const useRewardStack = create<RewardStackState>(() => ({ run: null }))

/** From a line landing to the next, quicker as the combo builds. */
export const LINE_GAPS_MS = [520, 430, 350, 290, 240, 200, 180]
/** A line's stomp, and when in it the line hits. */
export const STOMP_MS = 260
export const IMPACT_MS = 143
/** A soft line's rise. */
const SOFT_MS = 650
/** Lines shown at once; older ones fold away above. */
export const MAX_LINES = 3
/** Waiting for the celebration to open, at most. */
const HOLD_MS = 3200
/** Once it's open: its flame and count land first. */
const CELEBRATION_INTRO_MS = 1150
/** After the last line, before the total slams; the slam; the fall. */
const BEFORE_SLAM_MS = 240
export const SLAM_HIT_MS = 120
const AFTER_SLAM_MS = 520
const COLLAPSE_MS = 220
export const FLY_MS = 520
/** Players let go this long after the last reward. */
const RELEASE_SOUNDS_MS = 30_000

let nextId = 1
let timers: ReturnType<typeof setTimeout>[] = []
let releaseTimer: ReturnType<typeof setTimeout> | null = null
let celebration: { leave: () => void; at: number } | null = null
/**
 * What a run measures on screen: where its total lands (the toast's tally, the
 * pet card's coin count), and the card's scene it plays over.
 */
export type RewardTargetKey = 'toast' | 'card' | 'cardScene'

const targets = new Map<RewardTargetKey, RefObject<View | null>>()

let screenReader = false
let reduceMotion = false
void AccessibilityInfo.isScreenReaderEnabled()
  .then((on) => (screenReader = on))
  .catch(() => {})
void AccessibilityInfo.isReduceMotionEnabled()
  .then((on) => (reduceMotion = on))
  .catch(() => {})
AccessibilityInfo.addEventListener?.(
  'screenReaderChanged',
  (on) => (screenReader = on)
)
AccessibilityInfo.addEventListener?.(
  'reduceMotionChanged',
  (on) => (reduceMotion = on)
)

/**
 * Whether a reward plays as a stack here: the User's setting, and not with a
 * screen reader (it hears `announcement`) or Reduce Motion.
 */
export const rewardStackPlays = () =>
  usePreferences.getState().rewardAnimations && !screenReader && !reduceMotion

const later = (ms: number, step: () => void) => {
  timers.push(setTimeout(step, ms))
}

const update = (patch: Partial<RewardRun>) => {
  const { run } = useRewardStack.getState()
  if (run) useRewardStack.setState({ run: { ...run, ...patch } })
}

/**
 * Plays what a save earned. While a run from the User's saves is still
 * stomping, the lines join it and its count ends on the new total. Returns the
 * run that plays them, or null when none does (the setting is off, a screen
 * reader, or Reduce Motion): the caller shows a plain "+N" instead, and a
 * screen reader hears `announcement`.
 */
export function startReward(input: RewardRunInput): number | null {
  if (!input.lines.length) return null
  if (!rewardStackPlays()) {
    if (screenReader)
      AccessibilityInfo.announceForAccessibility(input.announcement)
    return null
  }
  const { run } = useRewardStack.getState()
  if (
    run &&
    input.slot === 'toast' &&
    run.home === 'toast' &&
    (run.phase === 'play' || run.phase === 'hold')
  ) {
    update({
      lines: [...run.lines, ...input.lines],
      count: { ...run.count, to: input.count.to },
      soft: false,
    })
    return run.id
  }
  endRun()
  if (releaseTimer) clearTimeout(releaseTimer)
  prepareRewardSounds()
  const soft =
    input.lines.length === 1 &&
    input.lines[0].tone === 'base' &&
    input.lines[0].amount < 4
  const id = nextId++
  useRewardStack.setState({
    run: {
      ...input,
      id,
      slot: input.slot,
      home: input.slot,
      phase: 'play',
      played: 0,
      shown: input.count.from,
      soft,
    },
  })
  later(input.slot === 'card' ? 250 : 0, next)
  return id
}

/** Plays the next line, waits for the celebration, or finishes. */
function next() {
  const { run } = useRewardStack.getState()
  if (!run) return
  const line = run.lines[run.played]
  if (!line) return finish()

  if (line.celebration && run.slot !== 'celebration') {
    if (celebration) {
      update({ slot: 'celebration', phase: 'hold' })
      const intro = Math.max(
        0,
        CELEBRATION_INTRO_MS - (Date.now() - celebration.at)
      )
      return later(intro, () => {
        update({ phase: 'play' })
        next()
      })
    }
    if (run.phase !== 'hold') {
      update({ phase: 'hold' })
      return later(HOLD_MS, () => {
        // It never opened: play it here.
        const current = useRewardStack.getState().run
        if (current?.id !== run.id || current.phase !== 'hold') return
        update({
          phase: 'play',
          lines: current.lines.map((l) => ({ ...l, celebration: false })),
        })
        next()
      })
    }
    return
  }

  const index = run.played
  update({ played: index + 1, phase: 'play' })
  if (run.soft) {
    playRewardSound('tick', { rate: semitones(3), volume: 0.6 })
    return later(SOFT_MS, next)
  }
  later(IMPACT_MS, () => {
    if (useRewardStack.getState().run?.id !== run.id) return
    if (line.tone === 'milestone') {
      playRewardSound('heavy')
      void Haptics.heavy().catch(() => {})
    } else {
      playRewardSound('hit', { rate: semitones(Math.min(index, 8) * 1.5) })
      void (line.amount >= 4 ? Haptics.medium() : Haptics.light()).catch(
        () => {}
      )
    }
  })
  later(LINE_GAPS_MS[index] ?? LINE_GAPS_MS[LINE_GAPS_MS.length - 1], next)
}

/** The total slams (two lines or more), then drops into its count. */
function finish() {
  const { run } = useRewardStack.getState()
  if (!run) return
  const fly = () => {
    const current = useRewardStack.getState().run
    if (current?.id !== run.id) return
    // The celebration lifts as the total drops back into the toast.
    if (current.slot === 'celebration') {
      celebration?.leave()
      celebration = null
    }
    update({ phase: 'fly', slot: current.home })
    later(FLY_MS, countUp)
  }
  if (run.played < 2) return later(run.soft ? 0 : 300, fly)
  later(BEFORE_SLAM_MS, () => {
    update({ phase: 'slam' })
    later(SLAM_HIT_MS, () => {
      playRewardSound('slam')
      void Haptics.success().catch(() => {})
    })
    later(AFTER_SLAM_MS + COLLAPSE_MS, fly)
  })
}

/** Counts the wallet up to its new total, a tick at a time, rising. */
function countUp() {
  const { run } = useRewardStack.getState()
  if (!run) return
  update({ phase: 'count' })
  const { from, to } = run.count
  const gain = Math.max(0, to - from)
  const ticks = Math.max(1, Math.min(gain, 12))
  const step = Math.max(30, Math.min(70, 420 / ticks))
  for (let tick = 1; tick <= ticks; tick++)
    later(step * (tick - 1), () => {
      update({ shown: from + Math.round(((to - from) * tick) / ticks) })
      playRewardSound('tick', {
        rate: semitones((7 * tick) / ticks),
        volume: 0.8,
      })
    })
  const landed = step * (ticks - 1)
  if (gain >= 3)
    later(landed + 60, () => {
      playRewardSound('land')
      void Haptics.light().catch(() => {})
    })
  later(landed + 700, endRun)
}

/** Ends the run where it is: its count shows the new total. */
function endRun() {
  for (const timer of timers) clearTimeout(timer)
  timers = []
  if (!useRewardStack.getState().run) return
  useRewardStack.setState({ run: null })
  if (releaseTimer) clearTimeout(releaseTimer)
  releaseTimer = setTimeout(releaseRewardSounds, RELEASE_SOUNDS_MS)
}

/**
 * The User tapped to skip: the whole run ends now, and the celebration it plays
 * in, if any, closes with it.
 */
export function skipReward() {
  const { run } = useRewardStack.getState()
  if (run)
    analytics.capture('reward_stack_skipped', {
      slot: run.slot,
      phase: run.phase,
      lines: run.lines.length,
      played: run.played,
    })
  if (run?.slot === 'celebration') celebration?.leave()
  celebration = null
  endRun()
}

/**
 * The streak celebration opened: a line waiting for it (`celebration`) plays in
 * it, and it closes through `leave` once the total drops back. Returns the
 * release, for when it closes first.
 */
export function claimRewardSlot(leave: () => void): () => void {
  const claim = { leave, at: Date.now() }
  celebration = claim
  const { run } = useRewardStack.getState()
  // Waiting for it already: go on now.
  if (run?.phase === 'hold') {
    for (const timer of timers) clearTimeout(timer)
    timers = []
    next()
  }
  return () => {
    if (celebration !== claim) return
    celebration = null
    const current = useRewardStack.getState().run
    if (current?.slot === 'celebration') update({ slot: current.home })
  }
}

/** Whether the celebration should stay open for the stack playing in it. */
export const rewardHoldsCelebration = () => {
  const { run } = useRewardStack.getState()
  return run?.slot === 'celebration'
}

/** Puts `ref` on screen as `key` (`RewardTargetKey`). Returns the release. */
export function registerRewardTarget(
  key: RewardTargetKey,
  ref: RefObject<View | null>
): () => void {
  targets.set(key, ref)
  return () => {
    if (targets.get(key) === ref) targets.delete(key)
  }
}

export const rewardTarget = (key: RewardTargetKey) => targets.get(key) ?? null

/** For tests: forget every run and claim. */
export function resetRewardStack() {
  endRun()
  celebration = null
  targets.clear()
}
