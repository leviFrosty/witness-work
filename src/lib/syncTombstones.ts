import { syncTimestamp } from '@/lib/syncClock'

type Tombstone = { id: string; deletedAt: number; legacyIds?: string[] }

const covers = (tombstone: Tombstone, id: string) =>
  tombstone.id === id || !!tombstone.legacyIds?.includes(id)

/**
 * The `updatedAt` for a record added or restored under `id`: past `previous`
 * and past every tombstone for that id. Other devices keep the tombstone, and
 * the merge keeps a record only when it's strictly newer than its tombstone. A
 * fresh stamp isn't enough, because a tombstone can be stamped up to 5 minutes
 * ahead of this clock (the merge's skew allowance).
 */
export const stampPastTombstone = (
  tombstones: readonly Tombstone[],
  id: string,
  previous = 0
): number =>
  syncTimestamp(
    tombstones.reduce(
      (latest, tombstone) =>
        covers(tombstone, id) ? Math.max(latest, tombstone.deletedAt) : latest,
      previous
    )
  )

/**
 * `tombstones` without the ones for `ids`, as a record under each id is live
 * again; the same array when there are none.
 */
export const withoutTombstones = <T extends Tombstone>(
  tombstones: T[],
  ids: ReadonlySet<string>
): T[] =>
  tombstones.some((tombstone) => ids.has(tombstone.id))
    ? tombstones.filter((tombstone) => !ids.has(tombstone.id))
    : tombstones
