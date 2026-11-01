import { syncTimestamp } from '@/lib/syncClock'

type Tombstone = { id: string; deletedAt: number; legacyIds?: string[] }

const covers = (tombstone: Tombstone, id: string) =>
  tombstone.id === id || !!tombstone.legacyIds?.includes(id)

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

export const withoutTombstones = <T extends Tombstone>(
  tombstones: T[],
  ids: ReadonlySet<string>
): T[] =>
  tombstones.some((tombstone) => ids.has(tombstone.id))
    ? tombstones.filter((tombstone) => !ids.has(tombstone.id))
    : tombstones
