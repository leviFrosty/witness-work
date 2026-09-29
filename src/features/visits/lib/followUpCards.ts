import type { Visit } from '@/types/visit'

/** The Home cards listing Follow-ups: missed ones, and ones coming up. */
export type FollowUpCard = 'missed' | 'approaching'

/**
 * Identifies a Follow-up as it appears on a card. The date is part of it so a
 * rescheduled Follow-up counts as new and brings a dismissed card back.
 */
export const followUpCardKey = (visit: Visit) =>
  `${visit.id}@${visit.followUp ? new Date(visit.followUp.date).getTime() : ''}`

/**
 * A closed card stays hidden while every Follow-up on it was already there when
 * it was closed, so closing it never hides a reminder the user hasn't seen.
 */
export const isFollowUpCardDismissed = (
  visits: Visit[],
  dismissedKeys: string[] | undefined
) => {
  if (!dismissedKeys) return false
  const dismissed = new Set(dismissedKeys)
  return visits.every((visit) => dismissed.has(followUpCardKey(visit)))
}
