import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
}))

vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: vi.fn(),
}))

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))

import {
  buildContactShareLink,
  isContactShareLink,
  parseContactShareLink,
  CONTACT_SHARE_LINK,
} from '@/features/contacts/lib/contactShareLink'
import { validateContactImport } from '@/features/contacts/lib/contactImport'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'

const makeContact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'contact-1',
  name: 'Joe Shmoe',
  createdAt: new Date('2026-04-15T00:00:00.000Z'),
  ...overrides,
})

const makeConversation = (overrides: Partial<Visit> = {}): Visit => ({
  id: 'conv-1',
  contact: { id: 'contact-1' },
  date: new Date('2026-04-10T12:00:00.000Z'),
  isBibleStudy: false,
  ...overrides,
})

describe('contactShareLink round-trip', () => {
  it('does not transfer calendar-publishing consent with a shared contact', () => {
    const conversation = makeConversation({
      followUp: {
        date: new Date('2026-10-01'),
        notifyMe: false,
        calendarIncluded: true,
        calendarDurationMinutes: 90,
      },
    })
    const parsed = parseContactShareLink(
      buildContactShareLink(makeContact(), [conversation]).url
    ) as { conversations: Visit[] }
    expect(parsed.conversations[0].followUp?.calendarIncluded).toBeUndefined()
    expect(
      parsed.conversations[0].followUp?.calendarDurationMinutes
    ).toBeUndefined()
    const imported = validateContactImport({
      type: 'witnesswork-contact',
      version: '1.0',
      contact: makeContact(),
      conversations: [conversation],
    })
    expect(imported.data?.conversations?.[0].followUp?.calendarIncluded).toBe(
      false
    )
  })
  it('encodes a contact into a URL that parses back to the same contact', () => {
    const contact = makeContact({ phone: '+1 555 123 4567' })
    const { url } = buildContactShareLink(contact, [])

    const parsed = parseContactShareLink(url)
    const validation = validateContactImport(parsed)

    expect(validation.success).toBe(true)
    expect(validation.data?.contact.id).toBe(contact.id)
    expect(validation.data?.contact.name).toBe(contact.name)
    expect(validation.data?.contact.phone).toBe(contact.phone)
  })

  it('round-trips conversations and returns them newest-first', () => {
    const contact = makeContact()
    const older = makeConversation({
      id: 'older',
      date: new Date('2026-01-01T00:00:00.000Z'),
    })
    const newer = makeConversation({
      id: 'newer',
      date: new Date('2026-04-10T00:00:00.000Z'),
    })
    const { url, includedConversations, trimmed } = buildContactShareLink(
      contact,
      [older, newer]
    )

    expect(trimmed).toBe(false)
    expect(includedConversations).toBe(2)

    const parsed = parseContactShareLink(url) as {
      conversations: Visit[]
    }
    expect(parsed.conversations.map((c) => c.id)).toEqual(['newer', 'older'])
  })
})

describe('isContactShareLink / parseContactShareLink URL matching', () => {
  const { url: sampleUrl } = buildContactShareLink(makeContact(), [])
  const samplePayload = new URL(sampleUrl).hash.slice(1)
  const { ORIGIN_PROD, PATH, LEGACY_PATH_PREFIX, SCHEME_HOST } =
    CONTACT_SHARE_LINK

  it('keeps the payload in the fragment, out of the path and query', () => {
    const url = new URL(sampleUrl)
    expect(sampleUrl).toBe(`${ORIGIN_PROD}${PATH}#${samplePayload}`)
    expect(url.pathname).toBe(PATH)
    expect(url.search).toBe('')
    expect(samplePayload).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('recognizes the https universal-link form', () => {
    expect(isContactShareLink(sampleUrl)).toBe(true)
    expect(parseContactShareLink(sampleUrl)).toMatchObject({
      contact: { id: 'contact-1', name: 'Joe Shmoe' },
    })
  })

  it('ignores a query string on the universal-link form', () => {
    const withQuery = `${ORIGIN_PROD}${PATH}?utm_source=share#${samplePayload}`
    expect(parseContactShareLink(withQuery)).toEqual(
      parseContactShareLink(sampleUrl)
    )
  })

  it('still parses the legacy path form from older app versions', () => {
    const legacyUrl = `${ORIGIN_PROD}${LEGACY_PATH_PREFIX}${samplePayload}`
    expect(isContactShareLink(legacyUrl)).toBe(true)
    expect(parseContactShareLink(legacyUrl)).toEqual(
      parseContactShareLink(sampleUrl)
    )
  })

  it('recognizes the witnesswork:// scheme fallback form', () => {
    const schemeUrl = `witnesswork://${SCHEME_HOST}/${samplePayload}`
    expect(isContactShareLink(schemeUrl)).toBe(true)
    expect(parseContactShareLink(schemeUrl)).toEqual(
      parseContactShareLink(sampleUrl)
    )
  })

  it('rejects URLs with a wrong host', () => {
    for (const bad of [
      `https://attacker.example.com${PATH}#${samplePayload}`,
      `https://attacker.example.com${LEGACY_PATH_PREFIX}${samplePayload}`,
    ]) {
      expect(isContactShareLink(bad)).toBe(false)
      expect(parseContactShareLink(bad)).toBeNull()
    }
  })

  it('rejects URLs with a wrong path', () => {
    for (const bad of [
      `${ORIGIN_PROD}/other#${samplePayload}`,
      `${ORIGIN_PROD}/other/${samplePayload}`,
      `${ORIGIN_PROD}/#${samplePayload}`,
    ]) {
      expect(isContactShareLink(bad)).toBe(false)
      expect(parseContactShareLink(bad)).toBeNull()
    }
  })

  it('rejects URLs with an empty payload', () => {
    for (const bad of [
      `${ORIGIN_PROD}${PATH}`,
      `${ORIGIN_PROD}${PATH}#`,
      `${ORIGIN_PROD}${LEGACY_PATH_PREFIX}`,
      `witnesswork://${SCHEME_HOST}/`,
    ]) {
      expect(isContactShareLink(bad)).toBe(false)
      expect(parseContactShareLink(bad)).toBeNull()
    }
  })

  it('rejects completely malformed URLs', () => {
    expect(isContactShareLink('not a url')).toBe(false)
    expect(parseContactShareLink('not a url')).toBeNull()
  })

  it('returns null for a well-formed URL with a corrupt payload', () => {
    for (const corrupt of [
      `${ORIGIN_PROD}${PATH}#not-valid-base64-or-gzip`,
      `${ORIGIN_PROD}${LEGACY_PATH_PREFIX}not-valid-base64-or-gzip`,
    ]) {
      expect(isContactShareLink(corrupt)).toBe(true)
      expect(parseContactShareLink(corrupt)).toBeNull()
    }
  })
})

describe('buildContactShareLink trimming', () => {
  const manyConversations = (count: number): Visit[] =>
    Array.from({ length: count }, (_, i) =>
      makeConversation({
        id: `conv-${i}`,
        // Spread dates so sort is deterministic: i=0 is oldest.
        date: new Date(2026, 0, 1 + i),
      })
    )

  // Deterministic incompressible data: LCG-based pseudo-random so gzip
  // can't collapse it, but the test is fully reproducible.
  const makeIncompressible = () => {
    let seed = 0x12345678
    return (len: number) => {
      let out = ''
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        out += String.fromCharCode(33 + (seed % 90))
      }
      return out
    }
  }

  it('caps at MAX_CONVERSATIONS even if every conversation would fit', () => {
    const contact = makeContact()
    const convs = manyConversations(CONTACT_SHARE_LINK.MAX_CONVERSATIONS + 10)
    const { includedConversations, trimmed } = buildContactShareLink(
      contact,
      convs
    )
    expect(includedConversations).toBeLessThanOrEqual(
      CONTACT_SHARE_LINK.MAX_CONVERSATIONS
    )
    expect(trimmed).toBe(true)
  })

  it('keeps the newest conversations when trimming by cap', () => {
    const contact = makeContact()
    const convs = manyConversations(CONTACT_SHARE_LINK.MAX_CONVERSATIONS + 5)
    const { url, includedConversations } = buildContactShareLink(contact, convs)
    const parsed = parseContactShareLink(url) as {
      conversations: Visit[]
    }
    const includedIds = parsed.conversations.map((c) => c.id)
    const expectedNewest = [...convs]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, includedConversations)
      .map((c) => c.id)
    expect(includedIds).toEqual(expectedNewest)
  })

  it('drops the oldest conversations to keep the link under MAX_URL_BYTES', () => {
    const incompressible = makeIncompressible()
    const convs = manyConversations(20).map((conversation) => ({
      ...conversation,
      note: incompressible(400),
    }))
    const { url, includedConversations, trimmed } = buildContactShareLink(
      makeContact(),
      convs
    )

    expect(trimmed).toBe(true)
    expect(includedConversations).toBeGreaterThan(0)
    expect(includedConversations).toBeLessThan(convs.length)
    expect(url.length).toBeLessThanOrEqual(CONTACT_SHARE_LINK.MAX_URL_BYTES)
    expect(new URL(url).pathname).toBe(CONTACT_SHARE_LINK.PATH)
    const parsed = parseContactShareLink(url) as { conversations: Visit[] }
    expect(parsed.conversations.map((c) => c.id)).toEqual(
      convs
        .slice(-includedConversations)
        .map((c) => c.id)
        .reverse()
    )
  })

  it('throws when the bare contact alone exceeds MAX_URL_BYTES', () => {
    const incompressible = makeIncompressible()
    const contact = makeContact({
      customFields: Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [
          `k${i}`,
          incompressible(CONTACT_SHARE_LINK.MAX_URL_BYTES * 2),
        ])
      ),
    })
    expect(() => buildContactShareLink(contact, [])).toThrow()
  })

  it('marks trimmed=false when nothing had to be dropped', () => {
    const { trimmed, includedConversations } = buildContactShareLink(
      makeContact(),
      [makeConversation()]
    )
    expect(trimmed).toBe(false)
    expect(includedConversations).toBe(1)
  })
})

describe('buildContactShareLink strip policy', () => {
  const buildAndParse = (contact: Contact, conversations: Visit[] = []) => {
    const { url } = buildContactShareLink(contact, conversations)
    return parseContactShareLink(url) as {
      contact: Partial<Contact> & Record<string, unknown>
      conversations?: (Partial<Visit> & Record<string, unknown>)[]
    }
  }

  it('strips empty-string optional fields', () => {
    const contact = makeContact({ phone: '', email: '' })
    const { contact: out } = buildAndParse(contact)
    expect(out).not.toHaveProperty('phone')
    expect(out).not.toHaveProperty('email')
  })

  it('strips a fully empty address object', () => {
    const contact = makeContact({
      address: {
        line1: '',
        line2: '',
        city: '',
        state: '',
        zip: '',
        country: '',
      },
    })
    const { contact: out } = buildAndParse(contact)
    expect(out).not.toHaveProperty('address')
  })

  it('keeps non-empty inner address fields', () => {
    const contact = makeContact({
      address: { line1: '', city: 'Seattle', country: 'USA', state: '' },
    })
    const { contact: out } = buildAndParse(contact)
    expect(out.address).toEqual({ city: 'Seattle', country: 'USA' })
  })

  it('never includes device-local fields in the payload', () => {
    const contact = makeContact({
      dismissedUntil: new Date(),
      dismissedNotificationId: 'notif-1',
      isFavorite: true,
      userDraggedCoordinate: true,
    })
    const { contact: out } = buildAndParse(contact)
    expect(out).not.toHaveProperty('dismissedUntil')
    expect(out).not.toHaveProperty('dismissedNotificationId')
    expect(out).not.toHaveProperty('isFavorite')
    expect(out).not.toHaveProperty('userDraggedCoordinate')
  })

  it('always includes required contact fields', () => {
    const { contact: out } = buildAndParse(makeContact())
    expect(out).toHaveProperty('id')
    expect(out).toHaveProperty('name')
    expect(out).toHaveProperty('createdAt')
  })

  it('strips empty followUp.topic while keeping required followUp fields', () => {
    const conv = makeConversation({
      followUp: {
        date: new Date('2026-05-01T00:00:00.000Z'),
        notifyMe: true,
        topic: '',
      },
    })
    const { conversations } = buildAndParse(makeContact(), [conv])
    const followUp = conversations?.[0].followUp as Record<string, unknown>
    expect(followUp).toHaveProperty('date')
    expect(followUp).toHaveProperty('notifyMe')
    expect(followUp).not.toHaveProperty('topic')
  })
})

describe('buildContactShareLink customFieldDefs embedding', () => {
  const makeDef = (id: string, label: string) => ({
    id,
    label,
    order: 0,
    createdAt: 1000,
    updatedAt: 2000,
  })

  it('embeds only defs that the contact references', () => {
    const contact = makeContact({
      customFields: { 'def-1': 'Acme' },
    })
    const defs = [
      makeDef('def-1', 'Company'),
      makeDef('def-2', 'Department'), // unreferenced — should NOT be embedded
    ]
    const { url } = buildContactShareLink(contact, [], defs)
    const parsed = parseContactShareLink(url) as {
      customFieldDefs?: Array<{ id: string; label: string }>
    }
    expect(parsed.customFieldDefs).toHaveLength(1)
    expect(parsed.customFieldDefs?.[0]).toMatchObject({
      id: 'def-1',
      label: 'Company',
    })
  })

  it('omits the customFieldDefs field entirely when there are no custom fields', () => {
    const contact = makeContact()
    const { url } = buildContactShareLink(contact, [], [makeDef('def-1', 'X')])
    const parsed = parseContactShareLink(url) as Record<string, unknown>
    expect(parsed).not.toHaveProperty('customFieldDefs')
  })

  it('preserves updatedAt on embedded defs (for LWW merging)', () => {
    const contact = makeContact({
      customFields: { 'def-1': 'Acme' },
    })
    const defs = [makeDef('def-1', 'Company')]
    const { url } = buildContactShareLink(contact, [], defs)
    const parsed = parseContactShareLink(url) as {
      customFieldDefs?: Array<{ updatedAt: number }>
    }
    expect(parsed.customFieldDefs?.[0].updatedAt).toBe(2000)
  })

  it('back-compat: omitting the defs argument still produces a valid link', () => {
    const contact = makeContact({ phone: '+1 555 000 0001' })
    const { url } = buildContactShareLink(contact, [])
    const parsed = parseContactShareLink(url) as Record<string, unknown>
    expect(parsed).toHaveProperty('contact')
    expect(parsed).not.toHaveProperty('customFieldDefs')
  })
})
