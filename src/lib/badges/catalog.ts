import {
  BADGE_LEVELS,
  BadgeArtId,
  BadgeCollectionId,
  BadgeKey,
  BadgeLevel,
  OneTimeBadgeId,
} from '@/types/badges'

/**
 * One Badge Collection. Every threshold counts calendar months (Year Round:
 * Service Years; Keeping in Touch: months with one person), so no collection
 * can move more than one step per month and no role earns faster than another.
 */
export type BadgeCollectionSpec = {
  id: BadgeCollectionId
  /** What reaches Bronze, Silver, Gold, and Pearl. */
  thresholds: readonly [number, number, number, number]
  /**
   * The counted months are also kept in `badgeLedger`, so progress survives
   * records the app deletes by design (data protection retention, a buddy's
   * reply expiring, report-month history being capped).
   */
  ledger: boolean
  /** Hidden, not even shown as a next step, until Buddies is available. */
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
  /** Hidden until earned, so it never reads as a target. */
  hiddenUntilEarned: true
  requiresBuddies?: boolean
}

export const ONE_TIME_BADGES: readonly OneTimeBadgeSpec[] = [
  { id: 'firstBibleStudy', hiddenUntilEarned: true },
  { id: 'firstBuddy', hiddenUntilEarned: true, requiresBuddies: true },
]

/** Shared-in-a-Service-Year months Year Round needs (two grace months). */
export const YEAR_ROUND_MONTHS = 10

export const collectionSpec = (id: BadgeCollectionId): BadgeCollectionSpec =>
  BADGE_COLLECTIONS.find((spec) => spec.id === id)!

export const badgeKey = (
  art: BadgeArtId,
  level?: BadgeLevel | null
): BadgeKey => (level ? `${art}.${level}` : art) as BadgeKey

/** Splits a stored key back into its art id and level. */
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

/** Every key the catalog can award, in display order. */
export const ALL_BADGE_KEYS: readonly BadgeKey[] = [
  ...BADGE_COLLECTIONS.flatMap((spec) =>
    BADGE_LEVELS.map((level) => badgeKey(spec.id, level))
  ),
  ...ONE_TIME_BADGES.map((badge) => badgeKey(badge.id)),
]

/**
 * Which earned badge to name when several arrive together: the rarer collection
 * first, then the higher level.
 */
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
