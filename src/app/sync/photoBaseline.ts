import type { PhotoReferences } from '@/app/sync/publishedPhotos'

/*
 * The baseline Cloud Sync's replaced-photo deletes compare against
 * (docs/cloud-sync-photos.md, "Deleting frees space right away"). Kept apart
 * from `publishedPhotos`, which reads every store, so the code that swaps this
 * device's data wholesale can rebase it without loading them.
 */

/**
 * The photos a User replaced or removed between two publishes: on a record in
 * both, referenced before and not now, and by nothing else now. A record that's
 * gone (deleted, maybe restorable) isn't one; cleanup handles it with its
 * grace.
 */
export function replacedPhotos(
  before: PhotoReferences,
  after: PhotoReferences
): string[] {
  const replaced = new Set<string>()
  for (const [key, previous] of before.byRecord) {
    const current = after.byRecord.get(key)
    if (!current) continue
    for (const filename of previous)
      if (!current.has(filename) && !after.all.has(filename))
        replaced.add(filename)
  }
  return [...replaced]
}

/**
 * What the last publish on a transport and account referred to: the baseline
 * the next publish's `replacedPhotos` compares against.
 */
let published: {
  identity: string | null
  references: PhotoReferences
  /** Reads the references again (`currentPhotoReferences`). */
  read: () => PhotoReferences
} | null = null
/** Counts `rebasePublishedPhotos` calls, so a publish can tell one happened. */
let rebases = 0

/** Marks the start of a publish, for `takeReplacedPhotos`. */
export const publishedPhotosMark = () => rebases

/**
 * Records the references a publish carried (read at `mark`) and returns the
 * photos replaced since the last publish on the same `identity`. Nothing when
 * there's no such publish, or when a bulk change landed while this one was out:
 * the baseline is that change's, and the next publish compares with it.
 */
export function takeReplacedPhotos(
  identity: string | null,
  references: PhotoReferences,
  mark: number,
  read: () => PhotoReferences
): string[] {
  if (mark !== rebases) return []
  const previous =
    published?.identity === identity ? published.references : null
  published = { identity, references, read }
  return previous ? replacedPhotos(previous, references) : []
}

/**
 * After this device's data changed other than by a User's edit (a restore or
 * Replace from a slot, a backup or another sync, a merge of other devices'
 * records): the baseline becomes the new state, so the next publish deletes
 * only what the User replaces from here. A restore may bring back an older
 * revision while other devices keep the newer one, and a merge can swing a
 * record either way; neither may delete a photo another device still uses.
 */
export function rebasePublishedPhotos(): void {
  rebases++
  if (published) published = { ...published, references: published.read() }
}
