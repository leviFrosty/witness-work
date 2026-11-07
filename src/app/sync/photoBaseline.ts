import type { PhotoReferences } from '@/app/sync/publishedPhotos'
import { logger } from '@/lib/logger'
import { mmkvStorage } from '@/stores/mmkv'

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

const STORAGE_KEY = 'cloudSync.publishedPhotos'

type Published = {
  identity: string | null
  references: PhotoReferences

  pending: Set<string>

  read?: () => PhotoReferences
}

let published: Published | null = null

let loaded = false

let defaultRead: (() => PhotoReferences) | null = null

let rebases = 0

export function setPhotoReferenceReader(read: () => PhotoReferences): void {
  defaultRead = read
}

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

function baseline(): Published | null {
  if (loaded) return published
  loaded = true
  try {
    const raw = mmkvStorage.getString(STORAGE_KEY)
    if (raw) published = parse(raw)
  } catch (error) {
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

export const publishedPhotosMark = () => rebases

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

export function pendingPhotoDeletes(identity: string | null): string[] {
  const current = baseline()
  return current?.identity === identity ? [...current.pending] : []
}

export function photoDeletesDone(filenames: string[]): void {
  const current = baseline()
  if (!current || !filenames.length) return
  const pending = new Set(current.pending)
  for (const filename of filenames) pending.delete(filename)
  setBaseline({ ...current, pending })
}

export function rebasePublishedPhotos(): void {
  rebases++
  const current = baseline()
  if (!current) return
  const read = current.read ?? defaultRead

  setBaseline({
    ...current,
    references: read ? read() : { byRecord: new Map(), all: new Set() },
    read: read ?? undefined,
  })
}

export function clearPublishedPhotos(): void {
  setBaseline(null)
}
