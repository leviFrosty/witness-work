import type { PetRecord } from '@/types/pet'
import { START_HEARTS } from '@/features/pet/lib/life'

/**
 * Hearts and coins change while nobody's looking: days pass, Siri or another
 * device logs time. So a device shows them as it last did until they're on
 * screen, then plays what changed: hearts one half at a time, then the coins
 * counting up, more of a show the bigger the gain (ADR 0035).
 */

/** What a pet surface shows: the hearts and the coins left to spend. */
export type PetShown = { coins: number; hearts: number }

/** Names the pet a seen record belongs to; a new adoption starts over. */
export const seenPetKey = (pet: Pick<PetRecord, 'seed' | 'adoptedOn'>) =>
  pet.seed ?? pet.adoptedOn

export const sameShown = (a: PetShown, b: PetShown) =>
  a.coins === b.coins && a.hearts === b.hearts

/**
 * What to show before revealing `now`: what this device last showed of this
 * pet. A pet adopted today starts from nothing, so its first coins fly in; any
 * other pet this device hasn't shown yet (one from before this build, or
 * another device's) starts from now, with nothing to play.
 */
export function shownBefore(
  seen: (PetShown & { pet: string }) | null,
  pet: string,
  now: PetShown,
  adoptedToday: boolean
): PetShown {
  if (seen?.pet === pet && typeof seen.coins === 'number')
    return { coins: seen.coins, hearts: seen.hearts }
  if (!adoptedToday) return now
  return { coins: 0, hearts: Math.min(now.hearts, START_HEARTS) }
}

/**
 * How much of a show a change gets. Coins come most days, so a day's 1 or 2 (a
 * planned day kept) is `small`, a few days' or a shared month's `medium`, and a
 * streak milestone's 10 or more `big`. Anything that went down is `loss`:
 * counted down, never celebrated.
 */
export type RevealTier = 'small' | 'medium' | 'big' | 'loss'

export function revealTier(delta: number): RevealTier {
  if (delta < 0) return 'loss'
  if (delta >= 10) return 'big'
  return delta >= 3 ? 'medium' : 'small'
}

/** Pixel coins that fly in for a tier, on a surface that has them. */
export const REVEAL_FLIGHTS: Record<RevealTier, number> = {
  small: 1,
  medium: 3,
  big: 5,
  loss: 0,
}

/** The hearts values a change steps through, half a heart at a time. */
export function heartSteps(from: number, to: number): number[] {
  const steps: number[] = []
  const step = to > from ? 0.5 : -0.5
  let value = from
  while (step > 0 ? value + step <= to : value + step >= to) {
    value += step
    steps.push(value)
  }
  if (value !== to) steps.push(to)
  return steps
}

/** The heart (0–4) that a step to `value` from `before` changed. */
export const changedHeart = (before: number, value: number): number =>
  Math.min(4, Math.max(0, Math.ceil(Math.max(before, value)) - 1))
