import type { StreakKind } from '@/lib/serviceStreak'
import {
  HAT_UNLOCK_ORDER,
  STARTER_ROOM_ITEMS,
  UNLOCK_ORDER,
  type PetRecord,
  type RoomItemId,
  type RoomPart,
} from '@/types/pet'

/**
 * How locked room items open up (`docs/pet-companion.md`):
 *
 * - `streak`: each the first time the raw Service Streak count reaches its number
 *   (`STREAK_THRESHOLDS`), not the `STREAK_MIN` display gate.
 * - `months`: one per active month since adoption, for a User with streaks
 *   hidden. Months, not hours, so every role unlocks at the same pace (ADR
 *   0019, ADR 0030).
 *
 * Hats (`HAT_UNLOCK_ORDER`) open up the same two ways on their own counts
 * (`HAT_THRESHOLDS`): three quick ones, then slower. Either way an earned item
 * is stored on the pet (`earnRoomItems`), so it never locks again.
 */
export type UnlockMode = 'streak' | 'months'

/** The streak count each item of `UNLOCK_ORDER` opens up at, by streak kind. */
export const STREAK_THRESHOLDS: Record<StreakKind, readonly number[]> = {
  plans: [1, 2, 3, 5, 7, 10, 14, 20, 25, 30, 40, 50, 60, 75, 90, 105, 120],
  months: [1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12, 12],
}

/**
 * The count each hat of `HAT_UNLOCK_ORDER` opens up at: by streak kind in
 * streak mode, by active months in months mode.
 */
export const HAT_THRESHOLDS: Record<
  StreakKind | 'activeMonths',
  readonly number[]
> = {
  plans: [3, 5, 9, 14, 21, 30, 40, 50, 65, 80, 100, 120],
  months: [1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12],
  // One a month after the first three, as the unlock note says.
  activeMonths: [1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
}

/**
 * Streak mode while streaks show, even for a `plans` streak with no Plans yet:
 * the locked note says to plan. Months mode with streaks hidden, so items still
 * open up.
 */
export const unlockMode = ({
  showStreaks,
}: {
  showStreaks: boolean
}): UnlockMode => (showStreaks ? 'streak' : 'months')

/** What the current mode counts: the streak's raw count, or active months. */
export type UnlockProgress =
  | { mode: 'streak'; kind: StreakKind; count: number }
  | { mode: 'months'; activeMonths: number }

/**
 * The items of `UNLOCK_ORDER`, then the hats of `HAT_UNLOCK_ORDER`, that
 * `progress` earns now, in order.
 */
export function roomItemsEarnedBy(progress: UnlockProgress): RoomItemId[] {
  if (progress.mode === 'months') {
    const months = Math.max(0, Math.floor(progress.activeMonths))
    return [
      ...UNLOCK_ORDER.slice(0, months),
      ...HAT_UNLOCK_ORDER.filter(
        (_, i) => months >= HAT_THRESHOLDS.activeMonths[i]
      ),
    ]
  }
  const thresholds = STREAK_THRESHOLDS[progress.kind]
  const hats = HAT_THRESHOLDS[progress.kind]
  return [
    ...UNLOCK_ORDER.filter((_, i) => progress.count >= thresholds[i]),
    ...HAT_UNLOCK_ORDER.filter((_, i) => progress.count >= hats[i]),
  ]
}

/**
 * The items the pet has stored as earned; none for a pet from before they were
 * stored, or a damaged list.
 */
export function storedRoomItems(
  pet: Pick<PetRecord, 'earnedRoomItems'> | null
): readonly string[] {
  const stored: unknown = pet?.earnedRoomItems
  return Array.isArray(stored)
    ? stored.filter((item): item is string => typeof item === 'string')
    : []
}

/** Items earned now that the pet hasn't stored yet. */
export const roomItemsToStore = (
  stored: readonly string[],
  earned: readonly RoomItemId[]
): RoomItemId[] => earned.filter((item) => !stored.includes(item))

/**
 * Room items the User can pick: the starters, the stored ones, and any earned
 * now.
 */
export function unlockedRoomItems(
  stored: readonly string[],
  earned: readonly RoomItemId[]
): Set<string> {
  return new Set([...STARTER_ROOM_ITEMS, ...stored, ...earned])
}

/**
 * The streak count `item` opens up at: 0 for a starter, null for an item the
 * order doesn't know.
 */
export function unlockStreakFor(item: string, kind: StreakKind): number | null {
  if ((STARTER_ROOM_ITEMS as readonly string[]).includes(item)) return 0
  const index = (UNLOCK_ORDER as readonly string[]).indexOf(item)
  if (index !== -1) return STREAK_THRESHOLDS[kind][index]
  const hat = (HAT_UNLOCK_ORDER as readonly string[]).indexOf(item)
  return hat === -1 ? null : HAT_THRESHOLDS[kind][hat]
}

/**
 * Active months still needed before `item` unlocks in months mode: 0 once it
 * has (and for anything that's always free), null for an item the order doesn't
 * know.
 */
export function nextUnlockIn(
  item: string,
  activeMonthCount: number
): number | null {
  if ((STARTER_ROOM_ITEMS as readonly string[]).includes(item)) return 0
  const months = Math.max(0, Math.floor(activeMonthCount))
  const index = (UNLOCK_ORDER as readonly string[]).indexOf(item)
  if (index !== -1) return Math.max(0, index + 1 - months)
  const hat = (HAT_UNLOCK_ORDER as readonly string[]).indexOf(item)
  if (hat === -1) return null
  return Math.max(0, HAT_THRESHOLDS.activeMonths[hat] - months)
}

/**
 * Whether the User can pick `option` for `part`. The window and sign are always
 * free; an option the order doesn't know (from a newer build) isn't offered.
 */
export function isRoomOptionUnlocked(
  part: RoomPart | 'window',
  option: string,
  unlocked: ReadonlySet<string>
): boolean {
  if (part === 'window' || part === 'sign') return true
  return unlocked.has(`${part}:${option}`)
}
