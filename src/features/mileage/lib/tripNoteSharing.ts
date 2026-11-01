import i18n, { type TranslationKey } from '@/lib/locales'
import { richTextImages } from '@/lib/richText/inspect'
import { getRichNoteDoc } from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'

export function tripNoteSharing(
  note: NoteFields,

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
