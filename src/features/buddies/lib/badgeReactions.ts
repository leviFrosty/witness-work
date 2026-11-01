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

export const BADGE_REACTION_EMOJI: readonly {
  id: BadgeReactionEmoji
  emoji: string
}[] = BADGE_REACTION_IDS.map((id) => ({ id, emoji: EMOJI[id] }))

export const isBadgeReactionEmoji = (
  value: unknown
): value is BadgeReactionEmoji =>
  (BADGE_REACTION_IDS as readonly unknown[]).includes(value)

export const badgeReactionEmoji = (id: BadgeReactionEmoji): string => EMOJI[id]
