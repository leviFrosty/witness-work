import type { SyncPhotoUsage } from '@/lib/syncTransport/server/syncClient'
import { noteImageIdFromFilename } from '@/lib/syncTransport/imageNames'
import { getNoteDoc, noteFields, type NoteUpdate } from '@/lib/richText/notes'
import { richTextImages, withoutRichTextImages } from '@/lib/richText/inspect'
import { parseRichText } from '@/lib/richText/parse'
import type { NoteFields } from '@/types/richText'

export const PHOTO_STORAGE_CATEGORIES = [
  'contacts',
  'notes',
  'profile',
  'recentlyDeleted',
  'unused',
  'other',
] as const

export type PhotoStorageCategory = (typeof PHOTO_STORAGE_CATEGORIES)[number]

export type PhotoStorageTotals = { bytes: number; count: number }

export type PhotoStorageBreakdown = {
  used: number
  limit: number
  categories: Record<PhotoStorageCategory, PhotoStorageTotals>

  unusedFiles: string[]

  recentlyDeletedContactIds: string[]

  files: string[]
}

export type PhotoStorageReferences = {
  contacts: Set<string>
  profile: Set<string>
  notes: Set<string>

  recentlyDeleted: Map<string, string>
}

export const PHOTO_IN_FLIGHT_GRACE_MS = 60 * 60_000

function categoryFromName(filename: string): PhotoStorageCategory {
  if (noteImageIdFromFilename(filename)) return 'notes'
  if (filename.startsWith('witness-work-img-profile')) return 'profile'
  return 'contacts'
}

export function categorizePhotoFiles(args: {
  files: { filename: string; size?: number; modifiedAt: number }[]
  references: PhotoStorageReferences
  usage: SyncPhotoUsage | null
  now: number
}): PhotoStorageBreakdown {
  const { files, references, usage, now } = args
  const categories = Object.fromEntries(
    PHOTO_STORAGE_CATEGORIES.map((category) => [
      category,
      { bytes: 0, count: 0 },
    ])
  ) as Record<PhotoStorageCategory, PhotoStorageTotals>
  const unusedFiles: string[] = []
  const deletedIds = new Set<string>()
  let listed = 0

  for (const { filename, size = 0, modifiedAt } of files) {
    let category: PhotoStorageCategory
    if (references.contacts.has(filename)) category = 'contacts'
    else if (references.notes.has(filename)) category = 'notes'
    else if (references.profile.has(filename)) category = 'profile'
    else if (references.recentlyDeleted.has(filename)) {
      category = 'recentlyDeleted'
      deletedIds.add(references.recentlyDeleted.get(filename)!)
    } else if (now - modifiedAt < PHOTO_IN_FLIGHT_GRACE_MS)
      category = categoryFromName(filename)
    else {
      category = 'unused'
      unusedFiles.push(filename)
    }
    categories[category].bytes += size
    categories[category].count += 1
    listed += size
  }

  const used = Math.max(usage?.bytes ?? listed, listed)
  categories.other.bytes = used - listed
  if (usage) categories.other.count = Math.max(0, usage.count - files.length)

  return {
    used,
    limit: usage?.limit ?? 0,
    categories,
    unusedFiles,
    recentlyDeletedContactIds: [...deletedIds],
    files: files.map((file) => file.filename),
  }
}

export function withoutNotePhotos<T extends NoteFields>(
  record: T
): NoteUpdate | null {
  const rich = parseRichText(record.noteDoc)
  if (!rich || richTextImages(rich.doc).length === 0) return null
  return noteFields(withoutRichTextImages(getNoteDoc(record)))
}
