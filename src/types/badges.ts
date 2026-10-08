/**
 * A **Badge Collection**: one habit the User can grow over time, with four
 * levels that share one illustration. Every collection counts calendar months
 * (Year Round counts Service Years), never hours, so every Publisher role earns
 * them at the same pace. See `CONTEXT.md` → Badges.
 */
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

/** A **One-time Badge**: a single moment with no levels. */
export const ONE_TIME_BADGE_IDS = ['firstBibleStudy', 'firstBuddy'] as const

export type OneTimeBadgeId = (typeof ONE_TIME_BADGE_IDS)[number]

/** Every distinct illustration: one per collection and one per moment. */
export type BadgeArtId = BadgeCollectionId | OneTimeBadgeId

/**
 * A **Badge Level**: 1 Bronze, 2 Silver, 3 Gold, 4 Pearl. Stored as a number so
 * renaming a level never touches saved data. Called "level", never "tier",
 * because Achievement Tier already means the monthly-goal celebration.
 */
export const BADGE_LEVELS = [1, 2, 3, 4] as const

export type BadgeLevel = (typeof BADGE_LEVELS)[number]

/**
 * The stable key of one earned badge: `monthsShared.2` for a collection level,
 * or the bare id of a One-time Badge (`firstBibleStudy`).
 */
export type BadgeKey = `${BadgeCollectionId}.${BadgeLevel}` | OneTimeBadgeId

/** The persisted record of an earned badge. Once earned, never revoked. */
export type EarnedBadge = {
  /** Epoch ms when this device (or a synced one) first recorded it. */
  at: number
  /** `YYYY-MM` of the month whose activity reached it, when known. */
  month?: string
  /** True when it was found in existing history rather than earned live. */
  history?: boolean
}

/**
 * How a badge travels on the Buddy Card: its art id and level (`l` is absent
 * for a One-time Badge). No counts, dates, or progress ever leave the device.
 */
export type SharedBadge = { c: BadgeArtId; l?: BadgeLevel }
