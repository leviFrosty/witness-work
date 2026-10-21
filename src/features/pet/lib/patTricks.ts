import type { PetSpecies } from '@/types/pet'
import type { PatResult, PetMood, ScenePlayer } from '@/features/pet/art'
import { createPatCounter, type PatCounter } from '@/features/pet/lib/eggs'

/** What a touch on the pet did. */
export type PetTouchResult = PatResult | 'trick' | 'twirl'

/** A scrub this long, without a pause, makes the pet twirl. */
export const SCRUB_TWIRL_MS = 2000
/** A longer pause between rub steps starts the scrub over. */
export const SCRUB_PAUSE_MS = 600

/**
 * Wires taps and rubs to the scene player: a tap that makes 15 within 5 s plays
 * the species' trick, and a rub that keeps going for {@link SCRUB_TWIRL_MS} (rub
 * steps no more than {@link SCRUB_PAUSE_MS} apart) plays the twirl, once per
 * drag; call `endRub` when the finger lifts. Sleeping and died pets ask to be
 * woken instead.
 */
export function createPetToucher(
  player: Pick<ScenePlayer, 'pat' | 'playTrick' | 'playTwirl'>,
  counter: PatCounter = createPatCounter()
) {
  let scrubStartMs: number | null = null
  let lastRubMs = 0
  let twirled = false
  return {
    touch(
      tMs: number,
      pet: { species: PetSpecies; mood: PetMood },
      opts: { rub?: boolean; nowMs?: number } = {}
    ): PetTouchResult {
      const result = player.pat(tMs, pet.mood, { rub: opts.rub })
      if (result !== 'pat') {
        if (result === 'wake') counter.reset()
        return result
      }
      const at = opts.nowMs ?? tMs
      if (opts.rub) {
        if (twirled) return 'pat'
        if (scrubStartMs === null || at - lastRubMs > SCRUB_PAUSE_MS)
          scrubStartMs = at
        lastRubMs = at
        if (at - scrubStartMs < SCRUB_TWIRL_MS) return 'pat'
        twirled = true
        player.playTwirl(tMs)
        return 'twirl'
      }
      if (!counter.pat(at)) return 'pat'
      player.playTrick(pet.species, tMs)
      return 'trick'
    },
    /** The finger lifted: the next rub starts a new scrub. */
    endRub: () => {
      scrubStartMs = null
      twirled = false
    },
    reset: () => counter.reset(),
  }
}

export type PetToucher = ReturnType<typeof createPetToucher>

/** Screen points of horizontal travel per rub step. */
export const RUB_STEP_PX = 28

/**
 * Counts rub steps along a drag: one each time the total horizontal travel
 * passes another {@link RUB_STEP_PX}.
 */
export function createRubTracker(stepPx = RUB_STEP_PX) {
  let lastX: number | null = null
  let travel = 0
  return {
    /** Returns how many rub steps the move to `x` completed. */
    move(x: number): number {
      if (lastX === null) {
        lastX = x
        return 0
      }
      travel += Math.abs(x - lastX)
      lastX = x
      const steps = Math.floor(travel / stepPx)
      travel -= steps * stepPx
      return steps
    },
    end(): void {
      lastX = null
      travel = 0
    },
  }
}
