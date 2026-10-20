import {
  GIFT_KINDS,
  type GiftKind,
  type PetKeepsake,
  type PetRecord,
} from '@/types/pet'

/** Days in a row at five hearts before gifts start. */
export const GIFT_AFTER_FULL_DAYS = 30
/** The fewest days between two gifts. */
export const GIFT_MIN_SPACING_DAYS = 7
/** About one eligible day in this many is a gift day. */
export const GIFT_ODDS = 10

/** 32-bit FNV-1a with a final avalanche, so nearby days spread evenly. */
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

/**
 * What a pet's gift days are drawn from: its random `seed`, or, for a pet
 * adopted before seeds, its adoption day. Synced with the record, so every
 * device draws the same days, and different from pet to pet.
 */
export const petGiftSeed = (pet: Pick<PetRecord, 'seed' | 'adoptedOn'>) =>
  pet.seed ? `seed:${pet.seed}` : `adopted:${pet.adoptedOn}`

/**
 * Whether `dayKey` can be a gift day for the pet with this `petGiftSeed`: the
 * same answer on every device. `simulateLife` makes it one only while the pet
 * has been at five hearts for `GIFT_AFTER_FULL_DAYS` days and the last gift was
 * at least `GIFT_MIN_SPACING_DAYS` ago.
 */
export const isGiftCandidate = (seed: string, dayKey: string): boolean =>
  giftHash(`${seed}:${dayKey}`) % GIFT_ODDS === 0

/** The kind of the pet's `ordinal`th gift (0-based): kinds take turns. */
export const giftKindAt = (ordinal: number): GiftKind =>
  GIFT_KINDS[
    ((ordinal % GIFT_KINDS.length) + GIFT_KINDS.length) % GIFT_KINDS.length
  ]

/**
 * The gift waiting on the rug: the latest one left during the current run at
 * five hearts that the User hasn't kept yet. Null when there's none. Collect it
 * with `collectKeepsake(gift.kind, gift.on)`.
 */
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
