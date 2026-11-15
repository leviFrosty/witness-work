import { describe, expect, it } from 'vitest'
import {
  categorizePhotoFiles,
  PHOTO_IN_FLIGHT_GRACE_MS,
  withoutNotePhotos,
  type PhotoStorageReferences,
} from '@/app/sync/photoStorageModel'
import { noteFields } from '@/lib/richText/notes'
import { richTextImages } from '@/lib/richText/inspect'
import { parseRichText } from '@/lib/richText/parse'
import type { RichTextDoc } from '@/types/richText'

const NOW = 1_800_000_000_000
const OLD = NOW - PHOTO_IN_FLIGHT_GRACE_MS - 1

const contact = 'witness-work-img-contact-c1--r1.jpg'
const profile = 'witness-work-img-profile--r2.jpg'
const note = 'witness-work-note-note-image-1.jpg'
const deleted = 'witness-work-img-contact-c2--r3.jpg'
const leftover = 'witness-work-img-contact-c1--r0.jpg'

const references = (): PhotoStorageReferences => ({
  contacts: new Set([contact]),
  profile: new Set([profile]),
  notes: new Set([note]),
  recentlyDeleted: new Map([[deleted, 'c2']]),
})

describe('categorizePhotoFiles', () => {
  it('groups each stored photo by what uses it', () => {
    const result = categorizePhotoFiles({
      files: [
        { filename: contact, size: 100, modifiedAt: OLD },
        { filename: profile, size: 20, modifiedAt: OLD },
        { filename: note, size: 300, modifiedAt: OLD },
        { filename: deleted, size: 40, modifiedAt: OLD },
        { filename: leftover, size: 50, modifiedAt: OLD },
      ],
      references: references(),
      usage: { bytes: 510, count: 5, limit: 1_000 },
      now: NOW,
    })
    expect(result.categories).toMatchObject({
      contacts: { bytes: 100, count: 1 },
      profile: { bytes: 20, count: 1 },
      notes: { bytes: 300, count: 1 },
      recentlyDeleted: { bytes: 40, count: 1 },
      unused: { bytes: 50, count: 1 },
      other: { bytes: 0, count: 0 },
    })
    expect(result.unusedFiles).toEqual([leftover])
    expect(result.recentlyDeletedContactIds).toEqual(['c2'])
    expect(result.used).toBe(510)
    expect(result.limit).toBe(1_000)
  })

  it('leaves a photo uploaded in the last hour alone, grouped by its name', () => {
    const fresh = NOW - PHOTO_IN_FLIGHT_GRACE_MS + 1
    const result = categorizePhotoFiles({
      files: [
        { filename: leftover, size: 50, modifiedAt: fresh },
        {
          filename: 'witness-work-note-another-image.jpg',
          size: 70,
          modifiedAt: fresh,
        },
      ],
      references: references(),
      usage: null,
      now: NOW,
    })
    expect(result.unusedFiles).toEqual([])
    expect(result.categories.contacts.bytes).toBe(50)
    expect(result.categories.notes.bytes).toBe(70)
  })

  it('shows storage it could not name as Other', () => {
    const result = categorizePhotoFiles({
      files: [{ filename: contact, size: 100, modifiedAt: OLD }],
      references: references(),
      usage: { bytes: 180, count: 3, limit: 1_000 },
      now: NOW,
    })
    expect(result.categories.other).toEqual({ bytes: 80, count: 2 })
    expect(result.used).toBe(180)
  })
})

describe('withoutNotePhotos', () => {
  const doc = (withImage: boolean): RichTextDoc => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Met at the door' }],
      },
      ...(withImage
        ? [
            {
              type: 'image' as const,
              attrs: { id: 'note-image-1', width: 10, height: 10 },
            },
          ]
        : []),
    ],
  })

  it('removes photos and keeps the words', () => {
    const record = noteFields(doc(true))
    expect(record.noteDoc).toBeDefined()
    const stripped = withoutNotePhotos(record)
    expect(stripped?.note).toBe('Met at the door')
    const rich = stripped?.noteDoc ? parseRichText(stripped.noteDoc) : null
    expect(rich ? richTextImages(rich.doc) : []).toEqual([])
  })

  it('leaves a note without photos unchanged', () => {
    expect(withoutNotePhotos(noteFields(doc(false)))).toBeNull()
    expect(withoutNotePhotos({ note: 'Plain text' })).toBeNull()
  })
})
