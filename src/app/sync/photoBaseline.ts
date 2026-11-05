import type { PhotoReferences } from '@/app/sync/publishedPhotos'
import { logger } from '@/lib/logger'
import { mmkvStorage } from '@/stores/mmkv'

/*
 * The baseline Cloud Sync's replaced-photo deletes compare against
 * (docs/cloud-sync-photos.md, "Deleting frees space right away"). Kept apart
 * from `publishedPhotos`, which reads every store, so the code that swaps this
 * device's data wholesale can rebase it without loading them.
 *
 * The baseline is saved in device-local MMKV (never synced): the app can be
 * killed between a User's edit and the publish that carries it, and the next
 * launch's publish still needs what the last one referred to.
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

/** Where the baseline is saved: filenames only, a record at a time. */
const STORAGE_KEY = 'cloudSync.publishedPhotos'

type Published = {
  identity: string | null
  references: PhotoReferences
  /**
   * The photos a publish found replaced whose delete hasn't finished: the app
   * can be killed, or the delete fail, after the baseline moved on.
   */
  pending: Set<string>
  /** Reads the references again (`currentPhotoReferences`). */
  read?: () => PhotoReferences
}

/**
 * What the last publish on a transport and account referred to: the baseline
 * the next publish's `replacedPhotos` compares against.
 */
let published: Published | null = null
/** Whether `published` has been read from storage yet. */
let loaded = false
/** Reads the references again, for a baseline loaded from storage. */
let defaultRead: (() => PhotoReferences) | null = null
/** Counts `rebasePublishedPhotos` calls, so a publish can tell one happened. */
let rebases = 0

/** Registers how to read the current references (`currentPhotoReferences`). */
export function setPhotoReferenceReader(read: () => PhotoReferences): void {
  defaultRead = read
}

/**
 * Only records that refer to a photo matter to `replacedPhotos`, and a baseline
 * only ever needs its own side of it, not `all`.
 */
function serialize(value: Published | null): string | null {
  if (!value) return null
  const byRecord: [string, string[]][] = []
  for (const [key, filenames] of value.references.byRecord)
    if (filenames.size) byRecord.push([key, [...filenames]])
  return JSON.stringify({
    identity: value.identity,
    byRecord,
    pending: [...value.pending],
  })
}

function parse(raw: string): Published | null {
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object') return null
  const { identity, byRecord, pending } = data as {
    identity?: unknown
    byRecord?: unknown
    pending?: unknown
  }
  if (identity !== null && typeof identity !== 'string') return null
  if (!Array.isArray(byRecord)) return null
  const records = new Map<string, Set<string>>()
  const all = new Set<string>()
  for (const entry of byRecord) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') return null
    if (!Array.isArray(entry[1])) return null
    const names = entry[1].filter((n): n is string => typeof n === 'string')
    records.set(entry[0], new Set(names))
    for (const name of names) all.add(name)
  }
  const names = Array.isArray(pending)
    ? pending.filter((n): n is string => typeof n === 'string')
    : []
  return {
    identity,
    references: { byRecord: records, all },
    pending: new Set(names),
  }
}

/** The baseline, read from storage the first time. */
function baseline(): Published | null {
  if (loaded) return published
  loaded = true
  try {
    const raw = mmkvStorage.getString(STORAGE_KEY)
    if (raw) published = parse(raw)
  } catch (error) {
    // Nothing to compare with: the next publish deletes nothing, and cleanup's
    // grace collects what it would have.
    logger.warn('[photoBaseline] saved baseline unreadable', error)
    published = null
  }
  return published
}

function setBaseline(next: Published | null): void {
  loaded = true
  published = next
  const raw = serialize(next)
  try {
    if (raw === null) mmkvStorage.delete(STORAGE_KEY)
    else mmkvStorage.set(STORAGE_KEY, raw)
  } catch (error) {
    logger.warn('[photoBaseline] saving the baseline failed', error)
  }
}

/** Marks the start of a publish, for `takeReplacedPhotos`. */
export const publishedPhotosMark = () => rebases

/**
 * Records the references a publish carried (read at `mark`) and returns the
 * photos replaced since the last publish on the same `identity`, this launch's
 * or an earlier one's. Nothing when there's no such publish, or when a bulk
 * change landed while this one was out: the baseline is that change's, and the
 * next publish compares with it.
 */
export function takeReplacedPhotos(
  identity: string | null,
  references: PhotoReferences,
  mark: number,
  read: () => PhotoReferences
): string[] {
  if (mark !== rebases) return []
  const previous = baseline()
  const same = previous?.identity === identity ? previous : null
  const replaced = same ? replacedPhotos(same.references, references) : []
  setBaseline({
    identity,
    references,
    pending: new Set([...(same?.pending ?? []), ...replaced]),
    read,
  })
  return replaced
}

/**
 * The photos replaced or removed whose delete hasn't finished, on this
 * `identity`: the ones just found, and those an earlier publish found that a
 * kill or a failure left. The caller checks each against what the records refer
 * to now before deleting it.
 */
export function pendingPhotoDeletes(identity: string | null): string[] {
  const current = baseline()
  return current?.identity === identity ? [...current.pending] : []
}

/** Takes finished (or no longer wanted) deletes off `pendingPhotoDeletes`. */
export function photoDeletesDone(filenames: string[]): void {
  const current = baseline()
  if (!current || !filenames.length) return
  const pending = new Set(current.pending)
  for (const filename of filenames) pending.delete(filename)
  setBaseline({ ...current, pending })
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
  const current = baseline()
  if (!current) return
  const read = current.read ?? defaultRead
  // Nothing to read the new state with: the next publish starts over, and the
  // deletes already found stay.
  setBaseline({
    ...current,
    references: read ? read() : { byRecord: new Map(), all: new Set() },
    read: read ?? undefined,
  })
}

/**
 * Forgets the baseline: the transport changed, or the account it described did.
 * The next publish records a new one and deletes nothing.
 */
export function clearPublishedPhotos(): void {
  setBaseline(null)
}
