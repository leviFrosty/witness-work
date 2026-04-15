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

vi.mock('../lib/logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('../lib/locales', () => ({
  default: { t: (key: string) => key },
}))

import {
  buildContactShareLink,
  isContactShareLink,
  parseContactShareLink,
  CONTACT_SHARE_LINK,
} from '../lib/contactShareLink'
import { validateContactImport } from '../lib/contactImport'
import { Contact } from '../types/contact'
import { Conversation } from '../types/conversation'

const makeContact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'contact-1',
  name: 'Joe Shmoe',
  createdAt: new Date('2026-04-15T00:00:00.000Z'),
  ...overrides,
})

const makeConversation = (
  overrides: Partial<Conversation> = {}
): Conversation => ({
  id: 'conv-1',
  contact: { id: 'contact-1' },
  date: new Date('2026-04-10T12:00:00.000Z'),
  isBibleStudy: false,
  ...overrides,
})

describe('contactShareLink round-trip', () => {
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
      conversations: Conversation[]
    }
    expect(parsed.conversations.map((c) => c.id)).toEqual(['newer', 'older'])
  })
})

describe('isContactShareLink / parseContactShareLink URL matching', () => {
  const { url: sampleUrl } = buildContactShareLink(makeContact(), [])
  const samplePayload = sampleUrl.slice(
    (CONTACT_SHARE_LINK.ORIGIN_PROD + CONTACT_SHARE_LINK.PATH_PREFIX).length
  )

  it('recognizes the https universal-link form', () => {
    expect(isContactShareLink(sampleUrl)).toBe(true)
  })

  it('recognizes the witnesswork:// scheme fallback form', () => {
    const schemeUrl = `witnesswork://${CONTACT_SHARE_LINK.SCHEME_HOST}/${samplePayload}`
    expect(isContactShareLink(schemeUrl)).toBe(true)
    const parsed = parseContactShareLink(schemeUrl)
    expect(parsed).not.toBeNull()
  })

  it('rejects URLs with a wrong host', () => {
    const bad = `https://attacker.example.com${CONTACT_SHARE_LINK.PATH_PREFIX}${samplePayload}`
    expect(isContactShareLink(bad)).toBe(false)
    expect(parseContactShareLink(bad)).toBeNull()
  })

  it('rejects URLs with a wrong path prefix', () => {
    const bad = `${CONTACT_SHARE_LINK.ORIGIN_PROD}/other/${samplePayload}`
    expect(isContactShareLink(bad)).toBe(false)
    expect(parseContactShareLink(bad)).toBeNull()
  })

  it('rejects URLs with an empty payload', () => {
    const bad = `${CONTACT_SHARE_LINK.ORIGIN_PROD}${CONTACT_SHARE_LINK.PATH_PREFIX}`
    expect(isContactShareLink(bad)).toBe(false)
    expect(parseContactShareLink(bad)).toBeNull()
  })

  it('rejects completely malformed URLs', () => {
    expect(isContactShareLink('not a url')).toBe(false)
    expect(parseContactShareLink('not a url')).toBeNull()
  })

  it('returns null for a well-formed URL with a corrupt payload', () => {
    const corrupt = `${CONTACT_SHARE_LINK.ORIGIN_PROD}${CONTACT_SHARE_LINK.PATH_PREFIX}not-valid-base64-or-gzip`
    expect(isContactShareLink(corrupt)).toBe(true)
    expect(parseContactShareLink(corrupt)).toBeNull()
  })
})

describe('buildContactShareLink trimming', () => {
  const manyConversations = (count: number): Conversation[] =>
    Array.from({ length: count }, (_, i) =>
      makeConversation({
        id: `conv-${i}`,
        // Spread dates so sort is deterministic: i=0 is oldest.
        date: new Date(2026, 0, 1 + i),
      })
    )

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
      conversations: Conversation[]
    }
    const includedIds = parsed.conversations.map((c) => c.id)
    const expectedNewest = [...convs]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, includedConversations)
      .map((c) => c.id)
    expect(includedIds).toEqual(expectedNewest)
  })

  it('throws when the bare contact alone exceeds MAX_URL_BYTES', () => {
    // Deterministic incompressible data: LCG-based pseudo-random so gzip
    // can't collapse it, but the test is fully reproducible.
    let seed = 0x12345678
    const incompressible = (len: number) => {
      let out = ''
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        out += String.fromCharCode(33 + (seed % 90))
      }
      return out
    }
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
  const buildAndParse = (
    contact: Contact,
    conversations: Conversation[] = []
  ) => {
    const { url } = buildContactShareLink(contact, conversations)
    return parseContactShareLink(url) as {
      contact: Partial<Contact> & Record<string, unknown>
      conversations?: (Partial<Conversation> & Record<string, unknown>)[]
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
