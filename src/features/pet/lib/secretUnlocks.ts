import type { BadgeKey } from '@/types/badges'
import { SECRET_ROOM_ITEMS, type SecretRoomItemId } from '@/types/pet'

export type SecretUnlock =
  | { by: 'badge'; badge: BadgeKey }
  | { by: 'badges'; count: number }
  | { by: 'keepsakes'; count: number }
  | { by: 'gold' }
  | { by: 'longRun'; months: number }

export type SecretProgress = {
  badges: ReadonlySet<string>

  keepsakes: number

  gold: boolean

  monthsOut: number
}

const badge = (key: BadgeKey): SecretUnlock => ({ by: 'badge', badge: key })

const longRun = (months: number): SecretUnlock => ({ by: 'longRun', months })

export const SECRET_UNLOCKS: Readonly<Record<SecretRoomItemId, SecretUnlock>> =
  {
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
    'hat:bush': longRun(15),
    'hat:tam': { by: 'badges', count: 12 },

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
    'wallColor:glacier': longRun(18),

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

    'bed:teacup': badge('conversations.1'),
    'bed:clam': { by: 'keepsakes', count: 1 },
    'bed:rowboat': badge('returnVisits.2'),
    'bed:donut': badge('monthsShared.1'),
    'bed:pouf': badge('conversations.3'),
    'bed:nest': { by: 'keepsakes', count: 10 },
    'bed:cheese': { by: 'badges', count: 10 },
    'bed:hammock': badge('keepingInTouch.1'),
    'bed:bread': badge('prepared.4'),
    'bed:bathtub': longRun(36),

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

    'lamp:lighthouse': badge('monthsShared.3'),
    'lamp:pierced': badge('yearRound.3'),
    'lamp:firefly': badge('keepingInTouch.3'),
    'lamp:mushroom': { by: 'keepsakes', count: 15 },
    'lamp:pearl': { by: 'badges', count: 14 },
    'lamp:cactus': { by: 'badges', count: 16 },
    'lamp:rocket': badge('monthsShared.4'),
    'lamp:hurricane': longRun(24),
    'lamp:jellyfish': badge('returnVisits.4'),
    'lamp:lava': badge('conversations.4'),
  }

export const isSecretItem = (item: string): item is SecretRoomItemId =>
  (SECRET_ROOM_ITEMS as readonly string[]).includes(item)

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
    case 'longRun':
      return progress.monthsOut >= rule.months
  }
}

export const secretItemsEarnedBy = (
  progress: SecretProgress
): SecretRoomItemId[] =>
  SECRET_ROOM_ITEMS.filter((item) =>
    secretRuleMet(SECRET_UNLOCKS[item], progress)
  )
