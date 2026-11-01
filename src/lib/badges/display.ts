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

export const badgeDescription = (art: BadgeArtId, level: BadgeLevel | null) => {
  if (!level || !isCollectionId(art))
    return i18n.t(`badge_${art}_desc` as TranslationKey)
  return i18n.t(`badge_${art}_desc` as TranslationKey, {
    count: collectionSpec(art).thresholds[level - 1],
  })
}

export const badgeHowTo = (art: BadgeArtId) =>
  i18n.t(`badge_${art}_how` as TranslationKey)

export const badgeTitle = (art: BadgeArtId, level: BadgeLevel | null) =>
  level
    ? i18n.t('badges_titleWithLevel', {
        name: badgeName(art),
        level: badgeLevelName(level),
      })
    : badgeName(art)

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

export const profileBadges = (earned: Readonly<Record<string, EarnedBadge>>) =>
  highestEarned(earned).sort(
    (a, b) =>
      b.at - a.at ||
      compareBadgeKeysForAnnouncement(
        badgeKey(a.art, a.level),
        badgeKey(b.art, b.level)
      )
  )

export const buddyCardBadges = (
  earned: Readonly<Record<string, EarnedBadge>>,
  { dataProtectionMode }: { dataProtectionMode: boolean }
): SharedBadge[] =>
  profileBadges(earned)
    .filter(({ art }) => !(dataProtectionMode && art === 'firstBibleStudy'))
    .map(({ art, level }) => (level ? { c: art, l: level } : { c: art }))

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

      earned: { level: BadgeLevel; record: EarnedBadge }[]
    }
  | {
      kind: 'oneTime'
      art: OneTimeBadgeId
      record: EarnedBadge
    }

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

export const buddyBadgeShelf = (badges: readonly SharedBadge[] | undefined) => {
  const known = knownSharedBadges(badges)
  return {
    collections: BADGE_COLLECTIONS.map((spec) => ({
      art: spec.id,
      level: (known.find(({ c }) => c === spec.id)?.l ?? 0) as BadgeLevel | 0,
    })),
    oneTime: ONE_TIME_BADGES.filter((badge) =>
      known.some(({ c }) => c === badge.id)
    ).map((badge) => ({ art: badge.id })),
  }
}

export const earnedBadgeCount = (
  earned: Readonly<Record<string, EarnedBadge>>
) => Object.keys(earned).filter((key) => parseBadgeKey(key) !== null).length

export const isNewBadge = (record: EarnedBadge, seenAt: number) =>
  record.at > seenAt

export const HOME_BADGE_CARD_MAX_AGE_MS = 31 * 24 * 60 * 60 * 1000

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
