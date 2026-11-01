import {
  GIFT_KINDS,
  type GiftKind,
  type PetKeepsake,
  type PetRecord,
} from '@/types/pet'

export const GIFT_AFTER_FULL_DAYS = 30

export const GIFT_MIN_SPACING_DAYS = 7

export const GIFT_ODDS = 10

export function giftHash(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16
  return hash >>> 0
}

export const petGiftSeed = (pet: Pick<PetRecord, 'seed' | 'adoptedOn'>) =>
  pet.seed ? `seed:${pet.seed}` : `adopted:${pet.adoptedOn}`

export const isGiftCandidate = (seed: string, dayKey: string): boolean =>
  giftHash(`${seed}:${dayKey}`) % GIFT_ODDS === 0

export const giftKindAt = (ordinal: number): GiftKind =>
  GIFT_KINDS[
    ((ordinal % GIFT_KINDS.length) + GIFT_KINDS.length) % GIFT_KINDS.length
  ]

export function pendingGift({
  life,
  keepsakes,
}: {
  life: { gift: { kind: GiftKind; on: string } | null } | null
  keepsakes: readonly PetKeepsake[]
}): { kind: GiftKind; on: string } | null {
  const gift = life?.gift
  if (!gift) return null
  return keepsakes.some((keepsake) => keepsake.on === gift.on) ? null : gift
}
