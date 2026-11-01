import {
  BADGE_LEVELS,
  BadgeArtId,
  BadgeCollectionId,
  BadgeKey,
  BadgeLevel,
  OneTimeBadgeId,
} from '@/types/badges'

export type BadgeCollectionSpec = {
  id: BadgeCollectionId

  thresholds: readonly [number, number, number, number]

  ledger: boolean

  requiresBuddies?: boolean
}

export const BADGE_COLLECTIONS: readonly BadgeCollectionSpec[] = [
  { id: 'monthsShared', thresholds: [1, 6, 24, 60], ledger: false },
  { id: 'yearRound', thresholds: [1, 3, 5, 10], ledger: false },
  { id: 'reportSent', thresholds: [1, 6, 24, 60], ledger: true },
  { id: 'prepared', thresholds: [1, 6, 24, 60], ledger: false },
  { id: 'conversations', thresholds: [1, 6, 24, 60], ledger: true },
  { id: 'returnVisits', thresholds: [1, 6, 24, 60], ledger: true },
  { id: 'nextTime', thresholds: [1, 6, 24, 60], ledger: true },
  { id: 'keepingInTouch', thresholds: [3, 6, 12, 24], ledger: true },
  {
    id: 'together',
    thresholds: [1, 3, 12, 36],
    ledger: true,
    requiresBuddies: true,
  },
]

export type OneTimeBadgeSpec = {
  id: OneTimeBadgeId

  hiddenUntilEarned: true
  requiresBuddies?: boolean
}

export const ONE_TIME_BADGES: readonly OneTimeBadgeSpec[] = [
  { id: 'firstBibleStudy', hiddenUntilEarned: true },
  { id: 'firstBuddy', hiddenUntilEarned: true, requiresBuddies: true },
]

export const YEAR_ROUND_MONTHS = 10

export const collectionSpec = (id: BadgeCollectionId): BadgeCollectionSpec =>
  BADGE_COLLECTIONS.find((spec) => spec.id === id)!

export const badgeKey = (
  art: BadgeArtId,
  level?: BadgeLevel | null
): BadgeKey => (level ? `${art}.${level}` : art) as BadgeKey

export const parseBadgeKey = (
  key: string
): { art: BadgeArtId; level: BadgeLevel | null } | null => {
  const [art, rawLevel] = key.split('.')
  if (rawLevel === undefined) {
    return ONE_TIME_BADGES.some((badge) => badge.id === art)
      ? { art: art as OneTimeBadgeId, level: null }
      : null
  }
  const level = Number(rawLevel) as BadgeLevel
  if (!BADGE_COLLECTIONS.some((spec) => spec.id === art)) return null
  if (!BADGE_LEVELS.includes(level)) return null
  return { art: art as BadgeCollectionId, level }
}

export const isCollectionId = (id: string): id is BadgeCollectionId =>
  BADGE_COLLECTIONS.some((spec) => spec.id === id)

export const ALL_BADGE_KEYS: readonly BadgeKey[] = [
  ...BADGE_COLLECTIONS.flatMap((spec) =>
    BADGE_LEVELS.map((level) => badgeKey(spec.id, level))
  ),
  ...ONE_TIME_BADGES.map((badge) => badgeKey(badge.id)),
]

export const ANNOUNCE_ORDER: readonly BadgeArtId[] = [
  'yearRound',
  'monthsShared',
  'keepingInTouch',
  'returnVisits',
  'together',
  'nextTime',
  'conversations',
  'reportSent',
  'prepared',
  'firstBibleStudy',
  'firstBuddy',
]

export const compareBadgeKeysForAnnouncement = (a: string, b: string) => {
  const pa = parseBadgeKey(a)
  const pb = parseBadgeKey(b)
  if (!pa || !pb) return 0
  const levelDiff = (pb.level ?? 0) - (pa.level ?? 0)
  if (levelDiff !== 0) return levelDiff
  return ANNOUNCE_ORDER.indexOf(pa.art) - ANNOUNCE_ORDER.indexOf(pb.art)
}
