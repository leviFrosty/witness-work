import {
  BADGE_COLLECTIONS,
  ONE_TIME_BADGES,
  badgeKey,
  collectionSpec,
  compareBadgeKeysForAnnouncement,
  isCollectionId,
  parseBadgeKey,
} from '@/lib/badges/catalog'
import type { BadgeEvaluation, CollectionProgress } from '@/lib/badges/evaluate'
import i18n, { TranslationKey } from '@/lib/locales'
import {
  BADGE_LEVELS,
  BadgeArtId,
  BadgeKey,
  BadgeCollectionId,
  BadgeLevel,
  EarnedBadge,
  OneTimeBadgeId,
  SharedBadge,
} from '@/types/badges'

export const badgeName = (art: BadgeArtId) =>
  i18n.t(`badge_${art}_name` as TranslationKey)

export const badgeLevelName = (level: BadgeLevel) =>
  i18n.t(`badgeLevel_${level}` as TranslationKey)

/** "Shared the good news in 6 months" — what this level stands for. */
export const badgeDescription = (art: BadgeArtId, level: BadgeLevel | null) => {
  if (!level || !isCollectionId(art))
    return i18n.t(`badge_${art}_desc` as TranslationKey)
  return i18n.t(`badge_${art}_desc` as TranslationKey, {
    count: collectionSpec(art).thresholds[level - 1],
  })
}

/** How to grow a collection, for its next step on the User's own shelf. */
export const badgeHowTo = (art: BadgeArtId) =>
  i18n.t(`badge_${art}_how` as TranslationKey)

/** "Sharing the Good News, Silver" — the full spoken name of one badge. */
export const badgeTitle = (art: BadgeArtId, level: BadgeLevel | null) =>
  level
    ? i18n.t('badges_titleWithLevel', {
        name: badgeName(art),
        level: badgeLevelName(level),
      })
    : badgeName(art)

/** The highest earned level per collection, plus earned One-time Badges. */
export const highestEarned = (
  earned: Readonly<Record<string, EarnedBadge>>
): { art: BadgeArtId; level: BadgeLevel | null; at: number }[] => {
  const best = new Map<
    BadgeArtId,
    { art: BadgeArtId; level: BadgeLevel | null; at: number }
  >()
  for (const [key, record] of Object.entries(earned)) {
    const parsed = parseBadgeKey(key)
    if (!parsed) continue
    const current = best.get(parsed.art)
    if (!current || (parsed.level ?? 0) > (current.level ?? 0))
      best.set(parsed.art, { ...parsed, at: record.at })
  }
  return [...best.values()]
}

/**
 * The badges a profile shows: one per collection at its highest level, newest
 * first so a fresh badge leads the row.
 */
export const profileBadges = (earned: Readonly<Record<string, EarnedBadge>>) =>
  highestEarned(earned).sort(
    (a, b) =>
      b.at - a.at ||
      compareBadgeKeysForAnnouncement(
        badgeKey(a.art, a.level),
        badgeKey(b.art, b.level)
      )
  )

/**
 * What the Buddy Card carries: each collection's highest level and every
 * One-time Badge. First Bible Study stays home in data protection mode.
 */
export const buddyCardBadges = (
  earned: Readonly<Record<string, EarnedBadge>>,
  { dataProtectionMode }: { dataProtectionMode: boolean }
): SharedBadge[] =>
  profileBadges(earned)
    .filter(({ art }) => !(dataProtectionMode && art === 'firstBibleStudy'))
    .map(({ art, level }) => (level ? { c: art, l: level } : { c: art }))

/** Drops shared badges this build doesn't know, e.g. from a newer app. */
export const knownSharedBadges = (
  badges: readonly SharedBadge[] | undefined
): SharedBadge[] => {
  const seen = new Set<string>()
  return (badges ?? []).filter(({ c, l }) => {
    const known = l
      ? isCollectionId(c) && BADGE_LEVELS.includes(l)
      : ONE_TIME_BADGES.some((badge) => badge.id === c)
    if (!known || seen.has(c)) return false
    seen.add(c)
    return true
  })
}

export type BadgeShelfEntry =
  | {
      kind: 'collection'
      art: BadgeCollectionId
      progress: CollectionProgress
      /** Earned levels, with when each was earned. */
      earned: { level: BadgeLevel; record: EarnedBadge }[]
    }
  | {
      kind: 'oneTime'
      art: OneTimeBadgeId
      record: EarnedBadge
    }

/**
 * The User's own collection: every collection that applies (Two by Two only
 * with Buddies, unless already earned) and every earned One-time Badge. Earned
 * levels come from the store, so a badge stays even when the records behind it
 * are gone.
 */
export const badgeShelf = ({
  evaluation,
  earned,
  buddiesAvailable,
}: {
  evaluation: BadgeEvaluation | null
  earned: Readonly<Record<string, EarnedBadge>>
  buddiesAvailable: boolean
}): BadgeShelfEntry[] => {
  const entries: BadgeShelfEntry[] = []
  for (const spec of BADGE_COLLECTIONS) {
    const levels = BADGE_LEVELS.flatMap((level) => {
      const record = earned[badgeKey(spec.id, level)]
      return record ? [{ level, record }] : []
    })
    if (spec.requiresBuddies && !buddiesAvailable && levels.length === 0)
      continue
    const live = evaluation?.collections[spec.id]
    const storedLevel = levels.at(-1)?.level ?? 0
    const level = Math.max(storedLevel, live?.level ?? 0) as BadgeLevel | 0
    entries.push({
      kind: 'collection',
      art: spec.id,
      earned: levels,
      progress: {
        id: spec.id,
        count: live?.count ?? 0,
        level,
        next: level === 4 ? null : spec.thresholds[level],
        reachedMonths: live?.reachedMonths ?? [],
      },
    })
  }
  for (const badge of ONE_TIME_BADGES) {
    const record = earned[badgeKey(badge.id)]
    if (record) entries.push({ kind: 'oneTime', art: badge.id, record })
  }
  return entries
}

/** How many badges (every level counts) the User has earned. */
export const earnedBadgeCount = (
  earned: Readonly<Record<string, EarnedBadge>>
) => Object.keys(earned).filter((key) => parseBadgeKey(key) !== null).length

/** Earned since the User last opened their badges. */
export const isNewBadge = (record: EarnedBadge, seenAt: number) =>
  record.at > seenAt

/**
 * How long a badge that arrived without a celebration can still be named on the
 * Home card: a badge from a restore or an old sync isn't news.
 */
export const HOME_BADGE_CARD_MAX_AGE_MS = 31 * 24 * 60 * 60 * 1000

/**
 * What the Home "New badge" card names, most notable first (ADR 0021): the
 * User's own badges that arrived without a full-screen celebration (nothing
 * they just did earned them, the celebration's moment passed, or another device
 * or a restore brought them), still new since they last opened their badges,
 * from the last month, and not dismissed. Badges still waiting for their
 * celebration (`waiting`) aren't named yet.
 */
export const homeCardBadges = ({
  earned,
  seenAt,
  dismissed,
  waiting,
  now,
}: {
  earned: Readonly<Record<string, EarnedBadge>>
  seenAt: number
  dismissed: readonly string[]
  waiting: readonly string[]
  now: number
}): BadgeKey[] =>
  Object.entries(earned)
    .filter(
      ([key, record]) =>
        parseBadgeKey(key) !== null &&
        !record.history &&
        isNewBadge(record, seenAt) &&
        now - record.at <= HOME_BADGE_CARD_MAX_AGE_MS &&
        !dismissed.includes(key) &&
        !waiting.includes(key)
    )
    .sort(
      ([a, ra], [b, rb]) =>
        rb.at - ra.at || compareBadgeKeysForAnnouncement(a, b)
    )
    .map(([key]) => key as BadgeKey)
