import type { PetRecord } from '@/types/pet'
import { START_HEARTS } from '@/features/pet/lib/life'

export type PetShown = { coins: number; hearts: number }

export const seenPetKey = (pet: Pick<PetRecord, 'seed' | 'adoptedOn'>) =>
  pet.seed ?? pet.adoptedOn

export const sameShown = (a: PetShown, b: PetShown) =>
  a.coins === b.coins && a.hearts === b.hearts

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

export type RevealTier = 'small' | 'medium' | 'big' | 'loss'

export function revealTier(delta: number): RevealTier {
  if (delta < 0) return 'loss'
  if (delta >= 10) return 'big'
  return delta >= 3 ? 'medium' : 'small'
}

export const REVEAL_FLIGHTS: Record<RevealTier, number> = {
  small: 1,
  medium: 3,
  big: 5,
  loss: 0,
}

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

export const changedHeart = (before: number, value: number): number =>
  Math.min(4, Math.max(0, Math.ceil(Math.max(before, value)) - 1))
