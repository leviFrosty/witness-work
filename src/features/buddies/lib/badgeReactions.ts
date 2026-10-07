/**
 * The preset reactions a User can send to a buddy's badge (Encourage). Only the
 * id travels in `badge.reaction`, never the emoji, so there's no free text and
 * the set can't be stretched by a modified app. No ✨ (it stands for AI here)
 * and no ❤️ (the Donor icon). Free of imports so any tier's UI can use it.
 */
export const BADGE_REACTION_IDS = [
  'party',
  'confetti',
  'fire',
  'clap',
  'thumbsUp',
  'raisedHands',
] as const

export type BadgeReactionEmoji = (typeof BADGE_REACTION_IDS)[number]

const EMOJI: Record<BadgeReactionEmoji, string> = {
  party: '🎉',
  confetti: '🎊',
  fire: '🔥',
  clap: '👏',
  thumbsUp: '👍',
  raisedHands: '🙌',
}

/** Every reaction in the order the reaction bar shows them. */
export const BADGE_REACTION_EMOJI: readonly {
  id: BadgeReactionEmoji
  emoji: string
}[] = BADGE_REACTION_IDS.map((id) => ({ id, emoji: EMOJI[id] }))

export const isBadgeReactionEmoji = (
  value: unknown
): value is BadgeReactionEmoji =>
  (BADGE_REACTION_IDS as readonly unknown[]).includes(value)

/** The emoji a reaction id stands for. */
export const badgeReactionEmoji = (id: BadgeReactionEmoji): string => EMOJI[id]
