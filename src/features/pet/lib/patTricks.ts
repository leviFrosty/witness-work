import type { PetSpecies } from '@/types/pet'
import type { PatResult, PetMood, ScenePlayer } from '@/features/pet/art'
import { createPatCounter, type PatCounter } from '@/features/pet/lib/eggs'

export type PetTouchResult = PatResult | 'trick' | 'twirl'

export const SCRUB_TWIRL_MS = 2000

export const SCRUB_PAUSE_MS = 600

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

    endRub: () => {
      scrubStartMs = null
      twirled = false
    },
    reset: () => counter.reset(),
  }
}

export type PetToucher = ReturnType<typeof createPetToucher>

export const RUB_STEP_PX = 28

export function createRubTracker(stepPx = RUB_STEP_PX) {
  let lastX: number | null = null
  let travel = 0
  return {
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
