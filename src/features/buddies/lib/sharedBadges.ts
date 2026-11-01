import {
  badgeKey,
  compareBadgeKeysForAnnouncement,
  parseBadgeKey,
} from '@/lib/badges/catalog'
import type { BadgeKey, SharedBadge } from '@/types/badges'

type WireBadge = { c: string; l?: number }

function wireBadgeKey({ c, l }: WireBadge): BadgeKey | null {
  if (c.includes('.')) return null
  const parsed = parseBadgeKey(l === undefined ? c : `${c}.${l}`)
  return parsed ? badgeKey(parsed.art, parsed.level) : null
}

export const sharedBadgeKey = (badge: SharedBadge): BadgeKey =>
  badgeKey(badge.c, badge.l)

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

export function holdsBadge(
  held: readonly SharedBadge[] | undefined,
  badge: SharedBadge
): boolean {
  return (held ?? []).some(
    (candidate) =>
      candidate.c === badge.c && (candidate.l ?? 0) >= (badge.l ?? 0)
  )
}

export const sortedForAnnouncement = (badges: readonly SharedBadge[]) =>
  [...badges].sort((a, b) =>
    compareBadgeKeysForAnnouncement(sharedBadgeKey(a), sharedBadgeKey(b))
  )

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
