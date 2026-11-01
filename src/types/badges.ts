export const BADGE_COLLECTION_IDS = [
  'monthsShared',
  'yearRound',
  'reportSent',
  'prepared',
  'conversations',
  'returnVisits',
  'nextTime',
  'keepingInTouch',
  'together',
] as const

export type BadgeCollectionId = (typeof BADGE_COLLECTION_IDS)[number]

export const ONE_TIME_BADGE_IDS = ['firstBibleStudy', 'firstBuddy'] as const

export type OneTimeBadgeId = (typeof ONE_TIME_BADGE_IDS)[number]

export type BadgeArtId = BadgeCollectionId | OneTimeBadgeId

export const BADGE_LEVELS = [1, 2, 3, 4] as const

export type BadgeLevel = (typeof BADGE_LEVELS)[number]

export type BadgeKey = `${BadgeCollectionId}.${BadgeLevel}` | OneTimeBadgeId

export type EarnedBadge = {
  at: number

  month?: string

  history?: boolean
}

export type SharedBadge = { c: BadgeArtId; l?: BadgeLevel }
