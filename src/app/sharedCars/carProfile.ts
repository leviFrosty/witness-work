import { MEMBER_AVATAR_MAX } from '@/lib/sharedSpaces/records'
import type { BuddyAvatar } from '@/features/buddies/lib/schemas'
import type {
  SharedCarProfile,
  SharedCarProfileProvider,
} from '@/app/sharedCars/profile'

/**
 * Who the User is on their Shared Cars, from Buddies
 * (docs/shared-cars-protocol.md, "Records"): the Buddy Card's name (the
 * roster's `card.name`), their photo or emoji only while All Buddies see it
 * (`sharing.photo`), and their own inbox, which each car hashes into their
 * `tag`. A photo is the card's thumbnail made 40 px, as Plans' guest lists
 * carry it, and kept until the thumbnail changes, so every sync puts the same
 * one.
 */
export type CarProfileDeps = {
  /** The Buddy Card's name. */
  cardName: () => string
  /** The inbox this device registered with the Buddies relay; null before. */
  inboxId: () => string | null
  /** All Buddies see the User's photo or emoji. */
  sharesPhoto: () => boolean
  /** The User's emoji, or the card's thumbnail (base64 JPEG). */
  avatar: () => BuddyAvatar | undefined
  /** A card thumbnail made 40 px, as base64 JPEG. */
  shrink: (jpegBase64: string) => Promise<string | undefined>
}

export function createCarProfile(
  deps: CarProfileDeps
): SharedCarProfileProvider {
  /** The last thumbnail made small, by the one it came from. */
  let kept: { source: string; data: string | undefined } | null = null

  async function carAvatar(
    avatar: BuddyAvatar | undefined
  ): Promise<string | undefined> {
    if (!avatar) return undefined
    if (avatar.t === 'emoji') return avatar.v
    if (kept?.source === avatar.v) return kept.data
    const data = await deps.shrink(avatar.v).catch(() => undefined)
    const fits = data && data.length <= MEMBER_AVATAR_MAX ? data : undefined
    kept = { source: avatar.v, data: fits }
    return fits
  }

  return async (): Promise<SharedCarProfile> => {
    const inboxId = deps.inboxId()
    // Shared Cars runs only once Buddies has started, which registers it.
    if (!inboxId) throw new Error('Buddies has not started on this device')
    const avatar = deps.sharesPhoto()
      ? await carAvatar(deps.avatar())
      : undefined
    return { name: deps.cardName(), inboxId, ...(avatar ? { avatar } : {}) }
  }
}

/**
 * What the profile is made from, as one value: a change to it changes what the
 * User's member record should say on every car.
 */
export const carProfileSource = (
  deps: Omit<CarProfileDeps, 'shrink'>
): string =>
  JSON.stringify([
    deps.cardName(),
    deps.inboxId(),
    deps.sharesPhoto() ? (deps.avatar() ?? null) : null,
  ])
