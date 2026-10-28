import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import Haptics from '@/lib/haptics'
import type { StreakKind } from '@/lib/serviceStreak'
import {
  rewardStackPlays,
  startReward,
  useRewardStack,
  type RewardLine,
  type RewardRun,
} from '@/stores/rewardStack'
import { NO_EARNINGS, type Earned } from '@/features/pet/lib/currency'
import { gainedText } from '@/features/pet/lib/roomLabels'
import { earnedCounts, rewardLines } from '@/features/pet/lib/rewardLines'
import {
  changedHeart,
  heartSteps,
  REVEAL_FLIGHTS,
  revealTier,
  sameShown,
  shownBefore,
  type PetShown,
  type RevealTier,
} from '@/features/pet/lib/reveal'
import { usePetSeen } from '@/features/pet/stores/petSeen'

/** Between half-heart steps. */
export const HEART_STEP_MS = 280
/** A flying coin, from the pet to its count. */
export const FLIGHT_MS = 650
/** Between one flight's start and the next. */
export const FLIGHT_STAGGER_MS = 120
/** Between the hearts and the coins. */
const PHASE_GAP_MS = 200
/** How long a count runs where nothing flies (Decorate Room, the Shop). */
const COUNT_MS: Record<RevealTier, number> = {
  small: 250,
  medium: 500,
  big: 800,
  loss: 400,
}

/** A heart that just changed, for its pop or crumble. */
export type HeartPulse = { id: number; index: number; up: boolean }
/** Coins about to count, for their "+N" and what flies in. */
export type GainPulse = { id: number; delta: number; tier: RevealTier }

export type PetReveal = {
  /** What to draw now. */
  shown: PetShown
  heart: HeartPulse | null
  coins: GainPulse | null
}

type Run = {
  id: number
  from: PetShown
  target: PetShown
  /** What earned the gain, played as the reward stack after the hearts. */
  stack: { lines: RewardLine[]; icon: RewardRun['icon'] } | null
}

let nextId = 0

/**
 * Shows `now` (the pet's hearts and wallet) as this device last showed it,
 * until `visible`, then plays the change and marks it seen, so it plays once:
 * each half heart, then the coins counting to now, with a haptic for the bigger
 * gains. Once started it plays through, wherever the User scrolls. `flights`:
 * the surface flies coins in, so the count waits for them to land. `stack` (the
 * Home card): a gain plays as the reward stack over the card instead, naming
 * what earned it since (`earned`, kept with what's seen). With Reduce Motion
 * the numbers change at once; a screen reader hears what was earned. While a
 * reward plays anywhere, the wallet counts along with it. Null `pet` (no
 * companion) shows `now` as it is.
 */
export default function usePetReveal({
  pet,
  now,
  earned,
  adoptedToday,
  visible,
  flights = false,
  stack,
}: {
  /** `seenPetKey` of the companion. */
  pet: string | null
  now: PetShown
  /** What earned the wallet now. */
  earned: Earned
  adoptedToday: boolean
  visible: boolean
  flights?: boolean
  /**
   * Play gains as the reward stack, its milestones named for `streakKind`, its
   * coins drawn by `icon`.
   */
  stack?: { streakKind: StreakKind; icon: RewardRun['icon'] }
}): PetReveal {
  const seen = usePetSeen((state) => state.seen)
  const rewardShown = useRewardStack((state) => state.run?.shown ?? null)
  const reduceMotion = useReducedMotion()
  const [run, setRun] = useState<Run | null>(null)
  const [frame, setFrame] = useState<PetReveal | null>(null)
  const { coins, hearts } = now
  const streakKind = stack?.streakKind
  const icon = stack?.icon

  // First sight of this pet here: remember where it starts.
  const unseen = pet !== null && seen?.pet !== pet
  useEffect(() => {
    if (!unseen || !pet) return
    const from = shownBefore(null, pet, { coins, hearts }, adoptedToday)
    usePetSeen.getState().markSeen({
      pet,
      ...from,
      earned: earnedCounts(adoptedToday ? NO_EARNINGS : earned),
    })
  }, [unseen, pet, coins, hearts, adoptedToday, earned])

  // On screen with something new: mark it seen and start playing it.
  useEffect(() => {
    if (!pet || !visible) return
    const target = { coins, hearts }
    const seenNow = usePetSeen.getState().seen
    const from = shownBefore(seenNow, pet, target, adoptedToday)
    if (sameShown(from, target)) return
    const lines =
      streakKind &&
      icon &&
      target.coins > from.coins &&
      seenNow?.pet === pet &&
      seenNow.earned
        ? rewardLines(seenNow.earned, earned, 'elsewhere', streakKind)
        : []
    const stacking =
      icon !== undefined && lines.length > 0 && rewardStackPlays()
    if (!stacking) announceGain(from, target)
    if (!reduceMotion) {
      // Keeps showing `from` until the run's first frame.
      setFrame({ shown: from, heart: null, coins: null })
      setRun({
        id: ++nextId,
        from,
        target,
        stack: stacking ? { lines, icon } : null,
      })
    }
    usePetSeen
      .getState()
      .markSeen({ pet, ...target, earned: earnedCounts(earned) })
  }, [
    pet,
    visible,
    coins,
    hearts,
    earned,
    adoptedToday,
    reduceMotion,
    streakKind,
    icon,
  ])

  useEffect(() => {
    if (!run) return
    const { from, target } = run
    const timers: ReturnType<typeof setTimeout>[] = []
    let current: PetReveal = { shown: from, heart: null, coins: null }
    let at = 0
    const later = (ms: number, step: () => void) => {
      at += ms
      timers.push(setTimeout(step, at))
    }
    const show = (patch: Partial<PetReveal>) => {
      current = { ...current, ...patch }
      setFrame(current)
    }

    let heartsBefore = from.hearts
    for (const value of heartSteps(from.hearts, target.hearts)) {
      const pulse = {
        index: changedHeart(heartsBefore, value),
        up: value > heartsBefore,
      }
      heartsBefore = value
      later(HEART_STEP_MS, () =>
        show({
          shown: { ...current.shown, hearts: value },
          heart: { id: ++nextId, ...pulse },
        })
      )
    }
    if (run.stack) {
      const { lines, icon } = run.stack
      // After the hearts, the stack takes the wallet over: it counts there.
      later(PHASE_GAP_MS, () => {
        startReward({
          slot: 'card',
          lines,
          count: { from: from.coins, to: target.coins },
          icon,
          announcement: gainedText(target.coins - from.coins) ?? '',
        })
        setFrame(null)
        setRun(null)
      })
      return () => timers.forEach(clearTimeout)
    }
    const delta = target.coins - from.coins
    if (delta !== 0) {
      const tier = revealTier(delta)
      const flying = flights ? REVEAL_FLIGHTS[tier] : 0
      later(PHASE_GAP_MS, () => show({ coins: { id: ++nextId, delta, tier } }))
      // The count runs while what flies lands.
      const wait = flying ? FLIGHT_MS : 120
      const runs = flying
        ? Math.max(250, (flying - 1) * FLIGHT_STAGGER_MS + 150)
        : COUNT_MS[tier]
      const ticks = Math.max(
        1,
        Math.min(Math.abs(delta), Math.round(runs / 40))
      )
      for (let tick = 1; tick <= ticks; tick++)
        later(tick === 1 ? wait : runs / ticks, () =>
          show({
            shown: {
              ...current.shown,
              coins: from.coins + Math.round((delta * tick) / ticks),
            },
          })
        )
      later(0, () => tierHaptic(tier))
    }
    later(PHASE_GAP_MS, () => {
      setFrame(null)
      setRun(null)
    })
    return () => timers.forEach(clearTimeout)
  }, [run, flights])

  // Leaving mid-play (unmounting) skips to the end: it's marked seen already.
  if (run && frame) return frame
  const before = pet ? shownBefore(seen, pet, now, adoptedToday) : now
  return {
    shown: rewardShown === null ? before : { ...before, coins: rewardShown },
    heart: null,
    coins: null,
  }
}

function tierHaptic(tier: RevealTier) {
  const haptic =
    tier === 'big' ? Haptics.success : tier === 'medium' ? Haptics.light : null
  void haptic?.().catch(() => {})
}

/** Tells a screen reader what was earned; hearts and losses it reads itself. */
function announceGain(from: PetShown, to: PetShown) {
  const text = gainedText(to.coins - from.coins)
  if (text) AccessibilityInfo.announceForAccessibility(text)
}
