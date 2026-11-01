import type { Visit } from '@/types/visit'

export type FollowUpCard = 'missed' | 'approaching'

export const followUpCardKey = (visit: Visit) =>
  `${visit.id}@${visit.followUp ? new Date(visit.followUp.date).getTime() : ''}`

export const isFollowUpCardDismissed = (
  visits: Visit[],
  dismissedKeys: string[] | undefined
) => {
  if (!dismissedKeys) return false
  const dismissed = new Set(dismissedKeys)
  return visits.every((visit) => dismissed.has(followUpCardKey(visit)))
}
