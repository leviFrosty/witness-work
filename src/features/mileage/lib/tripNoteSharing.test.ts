import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})

import { noteFields } from '@/lib/richText/notes'
import { tripNoteSharing } from '@/features/mileage/lib/tripNoteSharing'
import type { RichTextDoc } from '@/types/richText'

const withPhoto: RichTextDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Territory 4' }] },
    { type: 'image', attrs: { id: 'a1b2c3d4-photo', width: 4, height: 3 } },
  ],
}

describe('a trip note on a Shared Car', () => {
  it('takes photos on the User’s own cars, with no hint', () => {
    expect(tripNoteSharing({ note: 'Territory 4' }, undefined)).toEqual({
      allowImages: true,
    })
  })

  it('takes no photos, and says who it’s shared with', () => {
    expect(tripNoteSharing({ note: 'Territory 4' }, 2)).toEqual({
      allowImages: false,
      description: 'Shared with 2 other people on this car.',
    })
    expect(tripNoteSharing({}, 1).description).toBe(
      'Shared with 1 other person on this car.'
    )
    expect(tripNoteSharing({}, 0).description).toBe(
      'Shared with anyone who joins this car.'
    )
  })

  it('says the photos it already has aren’t shared', () => {
    const sharing = tripNoteSharing(noteFields(withPhoto), 3)
    expect(sharing.allowImages).toBe(false)
    expect(sharing.description).toBe(
      "Shared with 3 other people on this car. Its photos aren't shared."
    )
  })
})
