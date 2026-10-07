import {
  badgeKey,
  compareBadgeKeysForAnnouncement,
  parseBadgeKey,
} from '@/lib/badges/catalog'
import type { BadgeKey, SharedBadge } from '@/types/badges'

/** A badge as it arrives, before this build has checked it knows it. */
type WireBadge = { c: string; l?: number }

/** The key a shared badge stands for, or null when this build doesn't know it. */
function wireBadgeKey({ c, l }: WireBadge): BadgeKey | null {
  if (c.includes('.')) return null
  const parsed = parseBadgeKey(l === undefined ? c : `${c}.${l}`)
  return parsed ? badgeKey(parsed.art, parsed.level) : null
}

export const sharedBadgeKey = (badge: SharedBadge): BadgeKey =>
  badgeKey(badge.c, badge.l)

/**
 * The badges this build knows, each once, in the order they came. The same rule
 * as `knownSharedBadges` (`@/lib/badges/display`), kept free of i18n so the
 * engine runs anywhere.
 */
export function knownBadges(
  badges: readonly WireBadge[] | undefined
): SharedBadge[] {
  const seen = new Set<BadgeKey>()
  const known: SharedBadge[] = []
  for (const badge of badges ?? []) {
    const key = wireBadgeKey(badge)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const parsed = parseBadgeKey(key)!
    known.push(
      parsed.level ? { c: parsed.art, l: parsed.level } : { c: parsed.art }
    )
  }
  return known
}

/** The badge to name first when several arrive together. */
export const sortedForAnnouncement = (badges: readonly SharedBadge[]) =>
  [...badges].sort((a, b) =>
    compareBadgeKeysForAnnouncement(sharedBadgeKey(a), sharedBadgeKey(b))
  )

/**
 * A buddy's badges with news of new ones folded in, newest first: each
 * collection at its highest level. The next Buddy Card replaces the lot.
 */
export function withNewBadges(
  current: readonly SharedBadge[],
  news: readonly SharedBadge[]
): SharedBadge[] {
  const level = (badge: SharedBadge) => badge.l ?? 0
  const fresh = news.filter(
    (badge) =>
      !current.some((held) => held.c === badge.c && level(held) >= level(badge))
  )
  return [
    ...fresh,
    ...current.filter((held) => !fresh.some((badge) => badge.c === held.c)),
  ]
}
