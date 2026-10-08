import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Gzip, gzipSync, strToU8 } from 'fflate'

type AlertButton = { text: string; onPress?: () => unknown }
const alerts = vi.hoisted(
  () => [] as { title: string; message: string; buttons?: AlertButton[] }[]
)

vi.mock('react-native', () => ({
  Alert: {
    alert: (title: string, message: string, buttons?: AlertButton[]) => {
      alerts.push({ title, message, buttons })
    },
  },
  Platform: { OS: 'ios' },
}))
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }))
vi.mock('expo-file-system/legacy', () => ({ readAsStringAsync: vi.fn() }))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import {
  ContactImportData,
  handleContactImport,
  ImportHandlerCallbacks,
  importContactFromFile,
  importContactFromIncomingUrl,
  importContactFromLink,
  importedVisitId,
  parseContactImportFile,
  processCompleteImport,
  validateContactImport,
} from '@/features/contacts/lib/contactImport'
import {
  buildContactShareFile,
  CONTACT_SHARE_LIMITS,
} from '@/features/contacts/lib/contactShareFormat'
import {
  buildContactShareLink,
  CONTACT_SHARE_LINK,
  gunzipWithLimit,
  parseContactShareLink,
} from '@/features/contacts/lib/contactShareLink'
import { hasUnsafeKeys } from '@/lib/recordValidation'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import type { Contact } from '@/types/contact'
import type { CustomFieldDefinition } from '@/types/customField'
import type { Visit } from '@/types/visit'

const NOW = new Date('2026-10-01T12:00:00.000Z')
const SCHEME = `witnesswork://${CONTACT_SHARE_LINK.SCHEME_HOST}/`

const base64Url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString('base64url')
/** A share link carrying `payload` exactly as given (JSON text or object). */
const linkFor = (payload: unknown) =>
  SCHEME +
  base64Url(
    gzipSync(
      strToU8(typeof payload === 'string' ? payload : JSON.stringify(payload))
    )
  )

/** Gzips `bytes` of spaces without holding them all in memory. */
const gzipSpaces = (bytes: number) => {
  const parts: Uint8Array[] = []
  const stream = new Gzip({ level: 9 }, (chunk) => {
    parts.push(chunk)
  })
  const block = new Uint8Array(1024 * 1024).fill(0x20)
  for (let left = bytes; left > 0; left -= block.length) {
    stream.push(block.subarray(0, Math.min(block.length, left)), false)
  }
  stream.push(new Uint8Array(0), true)
  return Uint8Array.from(Buffer.concat(parts))
}

// Deterministic made-up prose, so notes compress like real ones.
const WORDS =
  'we talked about the hope of a better future and read a passage together she asked why there is so much suffering and we agreed to discuss it next week her husband listened for a while they have two children and a garden she works nights so mornings are best'.split(
    ' '
  )
const prose = (length: number, seed: number) => {
  let state = seed
  let out = ''
  while (out.length < length) {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    out += `${WORDS[state % WORDS.length]} `
  }
  return out.slice(0, length)
}

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const fieldDefs: CustomFieldDefinition[] = Array.from(
  { length: 20 },
  (_, i) => ({
    id: `3b2f1c0e-0000-4000-8000-${String(i).padStart(12, '0')}`,
    label: `Field ${i}`,
    order: i,
    createdAt: 1_700_000_000_000 + i,
    updatedAt: 1_750_000_000_000 + i,
    type: 'text',
    archived: i === 3,
    legacyIds: [`legacy-${i}`],
  })
)

/** The largest realistic contact: every shared field filled in. */
const makeLargeContact = (fieldCount = 20, fieldLength = 300): Contact => ({
  id: '6f1c2a34-9b1e-4c55-8d2a-1f0e9c3b7a42',
  name: 'Sample Person Longname-Example',
  createdAt: new Date('2016-03-01T10:00:00.000Z'),
  phone: '+1 555 201 4477',
  phoneRegionCode: 'US',
  email: 'sample.person@example.com',
  gender: 'female',
  address: {
    line1: '12345 North Example Avenue',
    line2: 'Apartment 4B',
    city: 'Sampletown',
    state: 'Example State',
    zip: '00000-1234',
    country: 'Exampleland',
  },
  coordinate: { latitude: 37.7599, longitude: -122.4148 },
  customFields: Object.fromEntries(
    fieldDefs
      .slice(0, fieldCount)
      .map((def, i) => [def.id, prose(fieldLength, i + 1)])
  ),
  // Device-local state that must never travel or be accepted.
  consentGivenAt: '2026-01-01T00:00:00.000Z',
  isFavorite: true,
  avatar: { type: 'emoji', value: '🌱' },
  avatarBackground: '#123456',
  heroBackground: '#654321',
  avatarMeta: { width: 1, height: 1 },
  dismissedUntil: new Date('2026-12-01T00:00:00.000Z'),
  dismissedNotificationId: 'dismiss-notification',
  userDraggedCoordinate: true,
  updatedAt: 1_790_000_000_000,
  readdedAt: 1_790_000_000_000,
  detailsRetainUntil: 1_800_000_000_000,
  redacted: false,
})

const makeVisits = (
  contactId: string,
  count: number,
  noteLength: number
): Visit[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `a${String(i).padStart(7, '0')}-1111-4222-8333-444455556666`,
    contact: { id: contactId },
    date: new Date(Date.UTC(2016, 2, 1) + i * 7 * 86_400_000),
    isBibleStudy: true,
    notAtHome: false,
    note: prose(noteLength, 1000 + i),
    followUp: {
      date: new Date(Date.UTC(2016, 2, 8) + i * 7 * 86_400_000),
      notifyMe: true,
      topic: prose(200, 5000 + i),
      notifications: [
        { id: `n${i}`, date: new Date(Date.UTC(2016, 2, 8) + i * 7 * 86e6) },
      ],
      reminderOffsetMinutes: 60,
      // Never travels:
      buddies: ['buddy-inbox-id'],
    },
    // Never travels:
    customFields: { 'conversation-field': 'Publication' },
    updatedAt: 1_790_000_000_000,
  }))

/** What a recipient should receive for `contact`: the shared fields only. */
const sharedContact = (contact: Contact) => {
  const {
    consentGivenAt: _c,
    isFavorite: _f,
    avatar: _a,
    avatarBackground: _ab,
    heroBackground: _hb,
    avatarMeta: _am,
    dismissedUntil: _du,
    dismissedNotificationId: _dn,
    userDraggedCoordinate: _ud,
    updatedAt: _u,
    readdedAt: _r,
    detailsRetainUntil: _d,
    redacted: _rd,
    ...shared
  } = contact
  return json(shared)
}
const sharedVisit = (visit: Visit) => {
  const { customFields: _cf, updatedAt: _u, followUp, ...shared } = visit
  const { buddies: _b, ...sharedFollowUp } = followUp!
  return json({ ...shared, followUp: sharedFollowUp })
}
const sharedDef = ({
  archived: _a,
  legacyIds: _l,
  ...def
}: CustomFieldDefinition) => ({ ...def, order: 0 })

const storeCallbacks = (): ImportHandlerCallbacks => {
  const contacts = useContacts.getState()
  const visits = useConversations.getState()
  return {
    addContact: contacts.addContact,
    updateContact: contacts.updateContact,
    recoverContact: contacts.recoverContact,
    mergeIncomingCustomFieldDefs: contacts.mergeIncomingCustomFieldDefs,
    addConversation: visits.addConversation,
    updateConversation: visits.updateConversation,
    getConversations: () => useConversations.getState().conversations,
    showToast: vi.fn(),
    navigate: vi.fn(),
  }
}

/** Runs the confirmed import, pressing `choice` if a conflict is offered. */
const runImport = async (
  data: ContactImportData,
  choice?: 'replace' | 'keep'
) => {
  const { contacts, deletedContacts } = useContacts.getState()
  const before = alerts.length
  await processCompleteImport(data, contacts, deletedContacts, storeCallbacks())
  if (choice) {
    const dialog = alerts.slice(before).find((alert) => alert.buttons)
    await dialog?.buttons?.find((button) => button.text === choice)?.onPress?.()
  }
}

const importLink = (payload: unknown) => importContactFromLink(linkFor(payload))
const share = (contact: unknown, conversations?: unknown[]) => ({
  version: '1.0',
  type: 'witnesswork-contact',
  exportedAt: NOW.toISOString(),
  contact,
  ...(conversations ? { conversations } : {}),
})
const validContact = {
  id: 'shared-1',
  name: 'Sample Shared',
  createdAt: '2026-01-01T00:00:00.000Z',
}
const visitsOf = (contactId: string) =>
  useConversations
    .getState()
    .conversations.filter((visit) => visit.contact.id === contactId)

beforeEach(() => {
  alerts.length = 0
  vi.mocked(FileSystem.readAsStringAsync).mockReset()
  vi.mocked(DocumentPicker.getDocumentAsync).mockReset()
  useContacts.setState({
    contacts: [],
    deletedContacts: [],
    customFieldDefs: [],
    deletedCustomFieldDefs: [],
  })
  useConversations.setState({ conversations: [], deletedConversations: [] })
})

describe('malformed contacts are refused', () => {
  it.each([
    ['an object', { first: 'Sample' }],
    ['a number', 42],
    ['an array', ['Sample']],
    ['null', null],
    ['empty', ''],
  ])('refuses a name that is %s', (_label, name) => {
    const payload = share({ ...validContact, name })
    expect(importLink(payload)).toEqual({
      success: false,
      errorTitle: 'invalidContactLink',
      error: 'invalidContactLink_description',
    })
    expect(parseContactImportFile(JSON.stringify(payload)).success).toBe(false)
  })

  it('refuses the wrong type anywhere in a contact or visit', () => {
    const visit = {
      id: 'v1',
      contact: { id: 'shared-1' },
      date: '2026-01-01T00:00:00.000Z',
      isBibleStudy: false,
    }
    for (const payload of [
      share({ ...validContact, id: { evil: 1 } }),
      share({ ...validContact, createdAt: 'not a date' }),
      share({ ...validContact, phone: 5551234 }),
      share({ ...validContact, address: 'Main St' }),
      share({ ...validContact, coordinate: { latitude: 'x', longitude: 0 } }),
      share({ ...validContact, coordinate: { latitude: 91, longitude: 0 } }),
      share({ ...validContact, customFields: { field: 7 } }),
      share({ ...validContact, gender: 'other' }),
      share(validContact, [{ ...visit, isBibleStudy: 'no' }]),
      share(validContact, [{ ...visit, note: { text: 'x' } }]),
      share(validContact, [{ ...visit, date: 'yesterday' }]),
      share(validContact, [{ ...visit, followUp: { date: 'x' } }]),
      share(validContact, [{ ...visit, id: '../escape' }]),
      share(validContact, [visit, 'not a visit']),
      { ...share(validContact), conversations: { 0: visit } },
    ]) {
      expect(validateContactImport(payload).success).toBe(false)
    }
  })

  it('refuses a share with many malformed fields as a whole', () => {
    const payload = `{"version":"1.0","type":"witnesswork-contact","exportedAt":"x",
      "contact":{"id":{"evil":1},"name":{"first":"x"},"createdAt":1,"__proto__":{"polluted":"yes"},
        "avatar":{"type":"emoji","value":"x"},"avatarMeta":{"width":"NaN"},"redacted":false,"isFavorite":true,
        "detailsRetainUntil":99999999999999,"customFields":{"__proto__":{"p":1}}},
      "conversations":[{"id":"victim-visit-id","contact":{"id":"some-other-local-contact"},"date":"2020-01-01","isBibleStudy":"no","note":{"x":1}}]}`
    expect(importLink(payload).success).toBe(false)
    expect(parseContactImportFile(payload).success).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it.each([
    [
      'on the contact',
      `{"type":"witnesswork-contact","contact":{"id":"a","name":"A","createdAt":"2026-01-01","__proto__":{}}}`,
    ],
    [
      'in custom fields',
      `{"type":"witnesswork-contact","contact":{"id":"a","name":"A","createdAt":"2026-01-01","customFields":{"__proto__":"x"}}}`,
    ],
    [
      'on a visit',
      `{"type":"witnesswork-contact","contact":{"id":"a","name":"A","createdAt":"2026-01-01"},"conversations":[{"id":"v","contact":{"id":"a"},"date":"2026-01-01","isBibleStudy":false,"constructor":{}}]}`,
    ],
    [
      'at the root',
      `{"type":"witnesswork-contact","prototype":{},"contact":{"id":"a","name":"A","createdAt":"2026-01-01"}}`,
    ],
  ])('refuses an unsafe key %s', (_where, payload) => {
    expect(importLink(payload).success).toBe(false)
    expect(parseContactImportFile(payload).success).toBe(false)
  })

  it('never stores keys outside the share format, even unvalidated', async () => {
    const crafted = JSON.parse(
      `{"id":"crafted","name":"Sample","createdAt":"2026-01-01","__proto__":{},"isFavorite":true}`
    )
    await handleContactImport(
      share(crafted) as ContactImportData,
      undefined,
      storeCallbacks()
    )
    const stored = useContacts.getState().contacts[0]
    expect(Object.keys(stored).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'updatedAt',
    ])
    expect(hasUnsafeKeys(useContacts.getState())).toBe(false)
  })

  it('returns a refusal for deeply nested input instead of throwing', () => {
    const nested = `${'['.repeat(100_000)}${']'.repeat(100_000)}`
    const payload = `{"type":"witnesswork-contact","contact":{"id":"a","name":"A","createdAt":"2026-01-01","customFields":${nested}}}`
    expect(() => parseContactImportFile(payload)).not.toThrow()
    expect(parseContactImportFile(payload).success).toBe(false)
  })

  it('writes nothing when a share is refused', async () => {
    const result = await importContactFromIncomingUrl(
      linkFor(share({ ...validContact, name: 42 }))
    )
    expect(result?.success).toBe(false)
    expect(useContacts.getState().contacts).toEqual([])
    expect(useConversations.getState().conversations).toEqual([])
  })
})

describe('visits stay with the contact being imported', () => {
  const seed = () => {
    const { addContact } = useContacts.getState()
    addContact({ id: 'A', name: 'Other Contact', createdAt: NOW })
    addContact({ id: 'B', name: 'Shared Contact', createdAt: NOW })
    const { addConversation } = useConversations.getState()
    addConversation({
      id: 'visit-of-A',
      contact: { id: 'A' },
      date: NOW,
      isBibleStudy: true,
      note: 'Private note about A',
    })
    addConversation({
      id: 'visit-of-B',
      contact: { id: 'B' },
      date: NOW,
      isBibleStudy: false,
      note: 'Old note about B',
      followUp: {
        date: NOW,
        notifyMe: true,
        buddies: ['buddy-inbox-id'],
      },
    })
  }
  const incomingVisit = (id: string, contactId: string, note: string) => ({
    id,
    contact: { id: contactId },
    date: '2026-09-01T15:00:00.000Z',
    isBibleStudy: false,
    note,
    followUp: { date: '2026-10-01T15:00:00.000Z', notifyMe: false },
  })

  it("Replace never touches another contact's visits", async () => {
    seed()
    const result = validateContactImport(
      share({ id: 'B', name: 'Shared Contact', createdAt: NOW.toISOString() }, [
        incomingVisit('visit-of-A', 'A', 'Imported text'),
      ])
    )
    await runImport(result.data!, 'replace')

    expect(
      useConversations
        .getState()
        .conversations.find((visit) => visit.id === 'visit-of-A')
    ).toMatchObject({ contact: { id: 'A' }, note: 'Private note about A' })
    const added = visitsOf('B').find((visit) => visit.note === 'Imported text')
    expect(added?.id).toBe(importedVisitId('B', 'visit-of-A'))
  })

  it("Replace updates the contact's own visits and keeps their device-only fields", async () => {
    seed()
    const result = validateContactImport(
      share({ id: 'B', name: 'Shared Contact', createdAt: NOW.toISOString() }, [
        incomingVisit('visit-of-B', 'B', 'Updated note about B'),
      ])
    )
    await runImport(result.data!, 'replace')

    expect(visitsOf('B')).toHaveLength(1)
    expect(visitsOf('B')[0]).toMatchObject({
      id: 'visit-of-B',
      note: 'Updated note about B',
      followUp: {
        date: '2026-10-01T15:00:00.000Z',
        notifyMe: false,
        buddies: ['buddy-inbox-id'],
      },
    })
  })

  it('a new contact gets its visits under fresh ids', async () => {
    seed()
    const result = validateContactImport(
      share({ id: 'C', name: 'New Contact', createdAt: NOW.toISOString() }, [
        incomingVisit('visit-of-A', 'A', 'Imported text'),
        incomingVisit('visit-of-A', 'A', 'Same id twice'),
      ])
    )
    await runImport(result.data!)

    expect(visitsOf('A').map((visit) => visit.note)).toEqual([
      'Private note about A',
    ])
    const imported = visitsOf('C')
    expect(imported.map((visit) => visit.note)).toEqual([
      'Imported text',
      'Same id twice',
    ])
    expect(new Set(imported.map((visit) => visit.id)).size).toBe(2)
    expect(imported.map((visit) => visit.id)).not.toContain('visit-of-A')
  })

  it('importing the same share again with Replace adds no duplicates', async () => {
    const data = validateContactImport(
      share({ id: 'C', name: 'New Contact', createdAt: NOW.toISOString() }, [
        incomingVisit('v1', 'C', 'First'),
        incomingVisit('v2', 'C', 'Second'),
      ])
    ).data!
    await runImport(data)
    await runImport(data, 'replace')
    await runImport(data, 'replace')

    expect(useContacts.getState().contacts).toHaveLength(1)
    expect(visitsOf('C').map((visit) => visit.note)).toEqual([
      'First',
      'Second',
    ])
  })

  it('Keep Existing writes nothing', async () => {
    seed()
    const before = useConversations.getState().conversations
    const result = validateContactImport(
      share({ id: 'B', name: 'Changed Name', createdAt: NOW.toISOString() }, [
        incomingVisit('visit-of-B', 'B', 'Changed'),
      ])
    )
    await runImport(result.data!, 'keep')

    expect(useConversations.getState().conversations).toBe(before)
    expect(
      useContacts.getState().contacts.find((contact) => contact.id === 'B')
        ?.name
    ).toBe('Shared Contact')
  })
})

describe('consent stays with each publisher', () => {
  const sendersContact = {
    ...validContact,
    consentGivenAt: '2026-01-01T00:00:00.000Z',
    isFavorite: true,
    dismissedUntil: '2027-01-01T00:00:00.000Z',
  }

  it('drops consent and other device-local fields on import', async () => {
    const result = importLink(share(sendersContact))
    expect(result.success).toBe(true)
    expect(result.data?.contact).toEqual(validContact)

    await runImport(result.data!)
    const stored = useContacts.getState().contacts[0]
    expect(stored.consentGivenAt).toBeUndefined()
    expect(stored.isFavorite).toBeUndefined()
    expect(stored.dismissedUntil).toBeUndefined()
  })

  it("Replace keeps the recipient's own consent", async () => {
    useContacts.getState().addContact({
      id: validContact.id,
      name: 'Old Name',
      createdAt: NOW,
      consentGivenAt: '2025-05-05T00:00:00.000Z',
    })
    const result = validateContactImport(
      share({ ...sendersContact, name: 'New Name' })
    )
    await runImport(result.data!, 'replace')

    expect(useContacts.getState().contacts[0]).toMatchObject({
      name: 'New Name',
      consentGivenAt: '2025-05-05T00:00:00.000Z',
    })
  })

  it('never writes consent passed to the handler unvalidated', async () => {
    await handleContactImport(
      share(sendersContact) as ContactImportData,
      undefined,
      storeCallbacks()
    )
    expect(useContacts.getState().contacts[0].consentGivenAt).toBeUndefined()
  })
})

describe('size limits', () => {
  const { MAX_LINK_PAYLOAD_CHARS, MAX_LINK_JSON_BYTES, MAX_FILE_BYTES } =
    CONTACT_SHARE_LIMITS

  it('refuses a link payload over the length limit before decoding it', () => {
    // Valid in every other way: random text barely compresses.
    let seed = 1
    const note = Buffer.from(
      Array.from({ length: 70_000 }, () => {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
        return seed >>> 24
      })
    ).toString('base64')
    const url = linkFor(
      share(validContact, [
        {
          id: 'v',
          contact: { id: validContact.id },
          date: '2026-01-01T00:00:00.000Z',
          isBibleStudy: false,
          note,
        },
      ])
    )
    expect(url.length).toBeGreaterThan(MAX_LINK_PAYLOAD_CHARS)
    expect(parseContactShareLink(url)).toBeNull()
    expect(importContactFromLink(url).success).toBe(false)
  })

  it('refuses a link that inflates to 200 MB', () => {
    const url = SCHEME + base64Url(gzipSpaces(200 * 1024 * 1024))
    expect(url.length).toBeGreaterThan(MAX_LINK_PAYLOAD_CHARS)
    expect(importContactFromLink(url).success).toBe(false)
  })

  it('refuses a short link that would inflate past the output limit', () => {
    const url = SCHEME + base64Url(gzipSpaces(40 * 1024 * 1024))
    expect(url.length).toBeLessThan(MAX_LINK_PAYLOAD_CHARS)
    expect(importContactFromLink(url).success).toBe(false)
  })

  it('stops inflating once the output passes the limit', () => {
    // Inflating everything would reach the corrupt tail and fail differently.
    const bomb = gzipSpaces(64 * 1024 * 1024)
    bomb.fill(0xff, bomb.length - 4096)
    expect(() => gunzipWithLimit(bomb, MAX_LINK_JSON_BYTES)).toThrow(
      'Contact share payload too large'
    )
  })

  it('ignores the size a gzip trailer claims', () => {
    const compressed = gzipSync(strToU8(JSON.stringify(share(validContact))))
    compressed.set([0xff, 0xff, 0xff, 0x7f], compressed.length - 4)
    const result = importContactFromLink(SCHEME + base64Url(compressed))
    expect(result.data?.contact).toEqual(validContact)
  })

  it('reads at most one byte past the file limit', async () => {
    // A valid share padded past the limit is still refused.
    const valid = JSON.stringify(share(validContact))
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(
      valid.padEnd(MAX_FILE_BYTES + 1)
    )
    const result = await importContactFromIncomingUrl(
      'file:///tmp/Sample.witnesswork'
    )
    expect(result).toEqual({ success: false, error: 'invalidFile_description' })
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
      'file:///tmp/Sample.witnesswork',
      { position: 0, length: MAX_FILE_BYTES + 1 }
    )
  })

  it('refuses counts and lengths past the limits', () => {
    const visit = {
      id: 'v',
      contact: { id: 'shared-1' },
      date: '2026-01-01T00:00:00.000Z',
      isBibleStudy: false,
    }
    const fields = (count: number) =>
      Object.fromEntries(
        Array.from({ length: count }, (_, i) => [`field-${i}`, 'x'])
      )
    for (const payload of [
      share(
        validContact,
        Array.from({ length: CONTACT_SHARE_LIMITS.MAX_VISITS + 1 }, () => visit)
      ),
      share(validContact, [
        { ...visit, note: 'x'.repeat(CONTACT_SHARE_LIMITS.MAX_TEXT_CHARS + 1) },
      ]),
      share({
        ...validContact,
        customFields: fields(CONTACT_SHARE_LIMITS.MAX_CUSTOM_FIELDS + 1),
      }),
      share({
        ...validContact,
        address: {
          line1: 'x'.repeat(CONTACT_SHARE_LIMITS.MAX_SHORT_TEXT_CHARS + 1),
        },
      }),
    ]) {
      expect(validateContactImport(payload).success).toBe(false)
    }
  })
})

describe('the file export follows the link policy', () => {
  it('leaves out everything the link leaves out', () => {
    const contact = makeLargeContact(2, 20)
    const visits = makeVisits(contact.id, 2, 40)
    const file = JSON.parse(buildContactShareFile(contact, visits, fieldDefs))

    expect(file.contact).toEqual(sharedContact(contact))
    expect(file.conversations).toEqual(
      [...visits].reverse().map((visit) => sharedVisit(visit))
    )
    expect(file.customFieldDefs).toEqual(
      fieldDefs.slice(0, 2).map((def) => sharedDef(def))
    )
    const text = JSON.stringify(file)
    for (const leaked of [
      'consentGivenAt',
      'buddy-inbox-id',
      'conversation-field',
      'isFavorite',
      'avatar',
      'legacyIds',
      'archived',
    ]) {
      expect(text).not.toContain(leaked)
    }
  })

  it('carries exactly what the link carries', () => {
    const contact = makeLargeContact(2, 20)
    const visits = makeVisits(contact.id, 2, 40)
    const { url } = buildContactShareLink(contact, visits, fieldDefs, NOW)
    expect(
      JSON.parse(buildContactShareFile(contact, visits, fieldDefs, NOW))
    ).toEqual(parseContactShareLink(url))
  })
})

describe('real shares still import intact', () => {
  it('round-trips the largest realistic contact through a file', async () => {
    const contact = makeLargeContact()
    const visits = makeVisits(contact.id, 520, 2000)
    const text = buildContactShareFile(contact, visits, fieldDefs)
    expect(text.length).toBeLessThan(CONTACT_SHARE_LIMITS.MAX_FILE_BYTES / 10)

    const result = parseContactImportFile(text)
    expect(result.success).toBe(true)
    expect(result.data?.contact).toEqual(sharedContact(contact))
    expect(result.data?.conversations).toEqual(
      [...visits].reverse().map((visit) => sharedVisit(visit))
    )
    expect(result.data?.customFieldDefs).toEqual(
      fieldDefs.map((def) => sharedDef(def))
    )

    await runImport(result.data!)
    const stored = useContacts.getState().contacts[0]
    expect(stored).toMatchObject(sharedContact(contact))
    expect(stored.consentGivenAt).toBeUndefined()
    expect(visitsOf(contact.id)).toHaveLength(520)
    expect(useContacts.getState().customFieldDefs).toHaveLength(20)
  })

  it('round-trips a full link and inflates far below the limit', () => {
    const contact = makeLargeContact(5, 60)
    const visits = makeVisits(contact.id, 60, 0).map((visit) => ({
      ...visit,
      note: 'Not at home. Left a tract.',
      followUp: { ...visit.followUp!, topic: 'Return visit' },
    }))
    const { url, includedConversations } = buildContactShareLink(
      contact,
      visits,
      fieldDefs
    )
    expect(includedConversations).toBeGreaterThan(0)
    expect(JSON.stringify(parseContactShareLink(url)).length).toBeLessThan(
      CONTACT_SHARE_LIMITS.MAX_LINK_JSON_BYTES / 10
    )

    const result = importContactFromLink(url)
    expect(result.success).toBe(true)
    expect(result.data?.contact).toEqual(sharedContact(contact))
    expect(result.data?.conversations).toEqual(
      [...visits]
        .reverse()
        .slice(0, includedConversations)
        .map((visit) => sharedVisit(visit))
    )
    expect(result.data?.customFieldDefs).toEqual(
      fieldDefs.slice(0, 5).map((def) => sharedDef(def))
    )
  })

  it('reaches the same validation from every entry point', async () => {
    const payload = new URL(
      buildContactShareLink(makeLargeContact(1, 10), []).url
    ).hash.slice(1)
    const { ORIGIN_PROD, PATH, LEGACY_PATH_PREFIX } = CONTACT_SHARE_LINK
    for (const url of [
      `${ORIGIN_PROD}${PATH}#${payload}`,
      `${ORIGIN_PROD}${LEGACY_PATH_PREFIX}${payload}`,
      `${SCHEME}${payload}`,
    ]) {
      expect((await importContactFromIncomingUrl(url))?.success).toBe(true)
    }

    const file = buildContactShareFile(makeLargeContact(1, 10), [])
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(file)
    for (const url of [
      'file:///Inbox/Sample.witnesswork',
      'content://com.example.provider/document/1',
    ]) {
      expect((await importContactFromIncomingUrl(url))?.success).toBe(true)
    }
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/Sample.witnesswork', name: 'x' }],
    } as Awaited<ReturnType<typeof DocumentPicker.getDocumentAsync>>)
    expect((await importContactFromFile()).success).toBe(true)

    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(
      JSON.stringify(share({ ...validContact, name: 42 }))
    )
    expect((await importContactFromFile()).success).toBe(false)
    expect(
      (await importContactFromIncomingUrl('file:///Inbox/Bad.witnesswork'))
        ?.success
    ).toBe(false)

    expect(await importContactFromIncomingUrl('https://example.com/c#x')).toBe(
      null
    )
  })
})
