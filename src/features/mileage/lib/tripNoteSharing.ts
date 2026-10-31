import i18n, { type TranslationKey } from '@/lib/locales'
import { richTextImages } from '@/lib/richText/inspect'
import { getRichNoteDoc } from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'

/**
 * How a trip's note works on a Shared Car, where everyone else on it reads it.
 * Note photos are files on this device that never reach anyone else, so no
 * photo can be added there. Photos the note already has (a trip logged before
 * the car was shared) stay as they are, and the hint says they aren't shared;
 * on other devices they show as a photo that isn't on that device, and an edit
 * there keeps them (docs/mileage-tracking-prd.md, "Shared Cars").
 */
export function tripNoteSharing(
  note: NoteFields,
  /** How many others are on the trip's Shared Car; absent on the User's own. */
  sharedWith: number | undefined
): { allowImages: boolean; description?: string } {
  if (sharedWith === undefined) return { allowImages: true }
  const doc = getRichNoteDoc(note)
  const hasPhotos = !!doc && richTextImages(doc).length > 0
  return {
    allowImages: false,
    description: [
      i18n.t('mileage.noteShared' as TranslationKey, { count: sharedWith }),
      hasPhotos && i18n.t('mileage.notePhotosNotShared'),
    ]
      .filter(Boolean)
      .join(' '),
  }
}
