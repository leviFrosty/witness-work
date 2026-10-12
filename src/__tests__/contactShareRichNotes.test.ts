import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
}))
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }))
vi.mock('expo-file-system/legacy', () => ({ readAsStringAsync: vi.fn() }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import {
  buildContactShareFile,
  parseContactShareData,
} from '@/features/contacts/lib/contactShareFormat'
import {
  buildContactShareLink,
  parseContactShareLink,
} from '@/features/contacts/lib/contactShareLink'
import { richTextImages } from '@/lib/richText/inspect'
import { getNoteDoc, noteFields } from '@/lib/richText/notes'
import type { Contact } from '@/types/contact'
import type { RichTextDoc } from '@/types/richText'
import type { Visit } from '@/types/visit'

const contact: Contact = {
  id: 'contact-1',
  name: 'Sam Example',
  createdAt: new Date('2026-04-15T00:00:00.000Z'),
}

const formatted: RichTextDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Bring ' },
        { type: 'text', text: 'Is Bible', marks: [{ type: 'bold' }] },
      ],
    },
    { type: 'image', attrs: { id: 'a1b2c3d4-photo', width: 4, height: 3 } },
  ],
}

const visit: Visit = {
  id: 'visit-1',
  contact: { id: 'contact-1' },
  date: new Date('2026-04-10T12:00:00.000Z'),
  isBibleStudy: false,
  ...noteFields(formatted),
}

describe('rich notes in contact shares', () => {
  it('carries formatting in a file, without photos', () => {
    const parsed = parseContactShareData(
      JSON.parse(buildContactShareFile(contact, [visit]))
    )
    const shared = parsed?.conversations?.[0]
    expect(shared?.note).toBe('Bring Is Bible')
    expect(shared?.noteDoc).toBeDefined()
    expect(richTextImages(getNoteDoc(shared!))).toEqual([])
    expect(getNoteDoc(shared!).content[0]).toEqual(formatted.content[0])
  })

  it('leaves formatting out of a link, keeping the plain note', () => {
    const parsed = parseContactShareLink(
      buildContactShareLink(contact, [visit]).url
    ) as { conversations: Visit[] }
    expect(parsed.conversations[0].note).toBe('Bring Is Bible')
    expect(parsed.conversations[0]).not.toHaveProperty('noteDoc')
  })

  it('imports a share whose formatting does not read', () => {
    const file = JSON.parse(buildContactShareFile(contact, [visit]))
    file.conversations[0].noteDoc = { v: 99, doc: 'nope' }
    const parsed = parseContactShareData(file)
    expect(parsed?.conversations?.[0].note).toBe('Bring Is Bible')
    expect(parsed?.conversations?.[0].noteDoc).toBeUndefined()
  })
})
