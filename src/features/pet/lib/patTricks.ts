import type { PetSpecies } from '@/types/pet'
import type { PatResult, PetMood, ScenePlayer } from '@/features/pet/art'
import { createPatCounter, type PatCounter } from '@/features/pet/lib/eggs'

/** What a touch on the pet did. */
export type PetTouchResult = PatResult | 'trick'

/**
 * Wires taps and rubs to the scene player: a pat that makes 15 within 5 s plays
 * the species' trick. Rubs count toward the trick too. Sleeping and died pets
 * ask to be woken instead.
 */
export function createPetToucher(
  player: Pick<ScenePlayer, 'pat' | 'playTrick'>,
  counter: PatCounter = createPatCounter()
) {
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
      if (!counter.pat(opts.nowMs ?? tMs)) return 'pat'
      player.playTrick(pet.species, tMs)
      return 'trick'
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
