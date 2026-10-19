import type { StreakKind } from '@/lib/serviceStreak'
import {
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
 * - `months`: one per active month since adoption, for a User with no streak to
 *   grow. Months, not hours, so every role unlocks at the same pace (ADR 0019,
 *   ADR 0030).
 *
 * Either way an earned item is stored on the pet (`earnRoomItems`), so it never
 * locks again.
 */
export type UnlockMode = 'streak' | 'months'

/** The streak count each item of `UNLOCK_ORDER` opens up at, by streak kind. */
export const STREAK_THRESHOLDS: Record<StreakKind, readonly number[]> = {
  plans: [1, 2, 3, 5, 7, 10, 14, 20, 25, 30, 40, 50, 60, 75, 90, 105, 120],
  months: [1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12, 12],
}

/**
 * Streak mode while the User has a streak that can grow: streaks shown and, for
 * a `plans` streak, at least one Plan or Recurring Plan to keep. Otherwise
 * months mode, so items still open up.
 */
export function unlockMode({
  showStreaks,
  kind,
  hasPlans,
}: {
  showStreaks: boolean
  kind: StreakKind
  hasPlans: boolean
}): UnlockMode {
  if (!showStreaks) return 'months'
  return kind === 'plans' && !hasPlans ? 'months' : 'streak'
}

/** What the current mode counts: the streak's raw count, or active months. */
export type UnlockProgress =
  | { mode: 'streak'; kind: StreakKind; count: number }
  | { mode: 'months'; activeMonths: number }

/** The items of `UNLOCK_ORDER` that `progress` earns now, in order. */
export function roomItemsEarnedBy(progress: UnlockProgress): RoomItemId[] {
  if (progress.mode === 'months')
    return UNLOCK_ORDER.slice(0, Math.max(0, Math.floor(progress.activeMonths)))
  const thresholds = STREAK_THRESHOLDS[progress.kind]
  return UNLOCK_ORDER.filter((_, i) => progress.count >= thresholds[i])
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
  return index === -1 ? null : STREAK_THRESHOLDS[kind][index]
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
  const index = (UNLOCK_ORDER as readonly string[]).indexOf(item)
  if (index === -1) return null
  return Math.max(0, index + 1 - Math.max(0, Math.floor(activeMonthCount)))
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
