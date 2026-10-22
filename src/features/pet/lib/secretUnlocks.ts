import type { StreakKind } from '@/lib/serviceStreak'
import type { BadgeKey } from '@/types/badges'
import { SECRET_ROOM_ITEMS, type SecretRoomItemId } from '@/types/pet'

/**
 * Secret room items and hats (`docs/pet-companion.md` → Secret items): rarer
 * options that don't follow the streak or the months. Each opens up on its own
 * milestone, and until it does Decorate Room shows only its silhouette and a
 * question mark, never what opens it.
 *
 * - `badge`: the User has earned that badge (`preferences.earnedBadges`).
 * - `badges`: the User has earned at least this many badges in all.
 * - `keepsakes`: the pet holds at least this many keepsakes.
 * - `gold`: the hearts have turned gold.
 * - `longRun`: the raw Service Streak reaches `plans` or `months` (by its kind,
 *   while the streak can grow), or the pet has `activeMonths` active months
 *   since adoption, whichever comes first, so every User can get there.
 *
 * Badges count months, never hours (ADR 0019), so no rule favours a role.
 */
export type SecretUnlock =
  | { by: 'badge'; badge: BadgeKey }
  | { by: 'badges'; count: number }
  | { by: 'keepsakes'; count: number }
  | { by: 'gold' }
  | { by: 'longRun'; plans: number; months: number; activeMonths: number }

/** What a secret item's rule reads. */
export type SecretProgress = {
  /** Keys of every badge earned (`monthsShared.2`, `firstBibleStudy`). */
  badges: ReadonlySet<string>
  /** Keepsakes the pet holds. */
  keepsakes: number
  /** The hearts are gold now. */
  gold: boolean
  /** The raw Service Streak, while it can grow (streak mode); else null. */
  streak: { kind: StreakKind; count: number } | null
  /** Months with an active day since adoption. */
  activeMonths: number
}

const badge = (key: BadgeKey): SecretUnlock => ({ by: 'badge', badge: key })
/**
 * A streak of `plans` days (`plans` kind) or `months` months, or as many active
 * months.
 */
const longRun = (plans: number, months: number): SecretUnlock => ({
  by: 'longRun',
  plans,
  months,
  activeMonths: months,
})

/**
 * Every secret item's rule. Most follow a badge, Bronze through Pearl, so the
 * first ones show up early and the last take years; a badge opens at most two.
 * A few follow how many badges, the keepsakes, gold hearts or a long run. The
 * type checker flags a secret item without a rule.
 */
export const SECRET_UNLOCKS: Readonly<Record<SecretRoomItemId, SecretUnlock>> =
  {
    // Hats
    'hat:duck': badge('monthsShared.1'),
    'hat:teapot': badge('conversations.1'),
    'hat:sailboat': badge('returnVisits.1'),
    'hat:pancakes': badge('prepared.2'),
    'hat:camel': badge('keepingInTouch.2'),
    'hat:pineapple': { by: 'gold' },
    'hat:nonla': badge('monthsShared.2'),
    'hat:chullo': badge('yearRound.1'),
    'hat:salakot': badge('conversations.2'),
    'hat:bowler': badge('reportSent.2'),
    'hat:straw': badge('nextTime.2'),
    'hat:fisherman': badge('returnVisits.2'),
    'hat:bush': longRun(150, 15),
    'hat:tam': { by: 'badges', count: 12 },
    // Wall colours
    'wallColor:indigo': badge('monthsShared.3'),
    'wallColor:delft': badge('reportSent.1'),
    'wallColor:turmeric': { by: 'keepsakes', count: 3 },
    'wallColor:terracotta': badge('prepared.1'),
    'wallColor:pistachio': badge('nextTime.1'),
    'wallColor:lilac': badge('keepingInTouch.1'),
    'wallColor:seaglass': badge('returnVisits.3'),
    'wallColor:plum': badge('yearRound.2'),
    'wallColor:cocoa': badge('conversations.3'),
    'wallColor:peach': { by: 'badges', count: 5 },
    'wallColor:paprika': { by: 'badges', count: 8 },
    'wallColor:glacier': longRun(200, 18),
    // Wall patterns
    'wallPattern:waves': badge('returnVisits.1'),
    'wallPattern:chevron': badge('nextTime.3'),
    'wallPattern:gingham': { by: 'badges', count: 3 },
    'wallPattern:scales': badge('nextTime.1'),
    'wallPattern:argyle': badge('keepingInTouch.2'),
    'wallPattern:ikat': badge('prepared.3'),
    'wallPattern:mosaic': { by: 'badges', count: 20 },
    'wallPattern:meadow': badge('monthsShared.2'),
    'wallPattern:honeycomb': { by: 'gold' },
    'wallPattern:fan': badge('reportSent.3'),
    // Floors
    'floor:zellige': badge('reportSent.4'),
    'floor:azulejo': badge('reportSent.2'),
    'floor:terrazzo': { by: 'badges', count: 16 },
    'floor:herringbone': badge('yearRound.3'),
    'floor:tatami': badge('yearRound.2'),
    'floor:pebbles': { by: 'keepsakes', count: 5 },
    'floor:hex': badge('prepared.1'),
    'floor:harlequin': badge('conversations.2'),
    'floor:chocolate': badge('keepingInTouch.4'),
    'floor:lilypond': badge('nextTime.4'),
    // Beds
    'bed:teacup': badge('conversations.1'),
    'bed:clam': { by: 'keepsakes', count: 1 },
    'bed:rowboat': badge('returnVisits.2'),
    'bed:donut': badge('monthsShared.1'),
    'bed:pouf': badge('conversations.3'),
    'bed:nest': { by: 'keepsakes', count: 10 },
    'bed:cheese': { by: 'badges', count: 10 },
    'bed:hammock': badge('keepingInTouch.1'),
    'bed:bread': badge('prepared.4'),
    'bed:bathtub': longRun(365, 36),
    // Shelves
    'shelf:ship': badge('reportSent.1'),
    'shelf:dala': badge('yearRound.1'),
    'shelf:spices': badge('prepared.2'),
    'shelf:nesting': badge('keepingInTouch.3'),
    'shelf:shells': { by: 'keepsakes', count: 8 },
    'shelf:abacus': badge('prepared.3'),
    'shelf:globe': badge('yearRound.4'),
    'shelf:robot': badge('nextTime.3'),
    'shelf:telescope': badge('nextTime.2'),
    'shelf:fishbowl': badge('returnVisits.3'),
    // Lights
    'lamp:lighthouse': badge('monthsShared.3'),
    'lamp:pierced': badge('yearRound.3'),
    'lamp:firefly': badge('keepingInTouch.3'),
    'lamp:mushroom': { by: 'keepsakes', count: 15 },
    'lamp:pearl': { by: 'badges', count: 14 },
    'lamp:cactus': { by: 'badges', count: 16 },
    'lamp:rocket': badge('monthsShared.4'),
    'lamp:hurricane': longRun(250, 24),
    'lamp:jellyfish': badge('returnVisits.4'),
    'lamp:lava': badge('conversations.4'),
  }

export const isSecretItem = (item: string): item is SecretRoomItemId =>
  (SECRET_ROOM_ITEMS as readonly string[]).includes(item)

/** Whether `rule` is met by `progress`. */
export function secretRuleMet(
  rule: SecretUnlock,
  progress: SecretProgress
): boolean {
  switch (rule.by) {
    case 'badge':
      return progress.badges.has(rule.badge)
    case 'badges':
      return progress.badges.size >= rule.count
    case 'keepsakes':
      return progress.keepsakes >= rule.count
    case 'gold':
      return progress.gold
    case 'longRun': {
      if (progress.activeMonths >= rule.activeMonths) return true
      const streak = progress.streak
      if (!streak) return false
      return streak.count >= rule[streak.kind]
    }
  }
}

/** The secret items `progress` opens up now, in `SECRET_ROOM_ITEMS` order. */
export const secretItemsEarnedBy = (
  progress: SecretProgress
): SecretRoomItemId[] =>
  SECRET_ROOM_ITEMS.filter((item) =>
    secretRuleMet(SECRET_UNLOCKS[item], progress)
  )
