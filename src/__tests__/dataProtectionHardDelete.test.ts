import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
// `householderData` evicts avatar files through `lib/contactAvatarFiles`, whose
// expo imports need expo-modules-core's `__DEV__`.
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/Documents/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  copyAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
}))
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(async () => ({ uri: '', width: 1, height: 1 })),
  SaveFormat: { JPEG: 'jpeg' },
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import { usePreferences } from '@/stores/preferences'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import {
  deleteAllHouseholderData,
  deleteHouseholderContact,
} from '@/stores/householderData'
import { isRedactedContactTombstone } from '@/lib/dataProtection'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'

const householder = (id: string): Contact => ({
  id,
  name: `Name ${id}`,
  phone: '+15550100',
  email: `${id}@example.com`,
  address: { line1: '12 Oak St', city: 'Springfield' },
  coordinate: { latitude: 1, longitude: 2 },
  customFields: { 'field-1': 'Lutheran' },
  consentGivenAt: '2026-01-01T00:00:00.000Z',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: 1,
})

const visitFor = (contactId: string, id: string): Visit => ({
  id,
  contact: { id: contactId },
  date: new Date('2026-02-01T00:00:00.000Z'),
  note: 'Talked about her church and her late husband',
  isBibleStudy: false,
})

const reset = (dataProtectionMode: boolean) => {
  usePreferences.setState({
    dataProtectionMode,
    dataProtectionModeSetByUser: false,
    prefillAddress: {
      enabled: true,
      address: { line1: '12 Oak St', city: 'Springfield' },
      lastUpdated: new Date(),
    },
  })
  useContacts.getState().set({
    contacts: [householder('a'), householder('b')],
    deletedContacts: [],
    customFieldDefs: [],
    deletedCustomFieldDefs: [],
  })
  useConversations.setState({
    conversations: [
      visitFor('a', 'v1'),
      visitFor('a', 'v2'),
      visitFor('b', 'v3'),
    ],
    deletedConversations: [],
  })
}

describe('deleteHouseholderContact in data protection mode', () => {
  beforeEach(() => reset(true))

  it('leaves only a redacted tombstone', () => {
    deleteHouseholderContact('a')
    const { contacts, deletedContacts } = useContacts.getState()

    expect(contacts.map((c) => c.id)).toEqual(['b'])
    expect(deletedContacts).toHaveLength(1)
    const [tombstone] = deletedContacts
    expect(isRedactedContactTombstone(tombstone)).toBe(true)
    expect(Object.keys(tombstone).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'redacted',
      'updatedAt',
    ])
    expect(JSON.stringify(tombstone)).not.toContain('Oak St')
  })

  it('cascade-deletes the contact visits, leaving id-only tombstones', () => {
    deleteHouseholderContact('a')
    const { conversations, deletedConversations } = useConversations.getState()

    expect(conversations.map((c) => c.id)).toEqual(['v3'])
    expect(deletedConversations.map((t) => t.id).sort()).toEqual(['v1', 'v2'])
    for (const tombstone of deletedConversations) {
      expect(Object.keys(tombstone).sort()).toEqual(['deletedAt', 'id'])
    }
  })

  it('refuses to recover a redacted tombstone', () => {
    deleteHouseholderContact('a')
    useContacts.getState().recoverContact('a')
    expect(useContacts.getState().contacts.map((c) => c.id)).toEqual(['b'])
  })
})

describe('deleteHouseholderContact with the mode off', () => {
  beforeEach(() => reset(false))

  it('keeps the full record and its visits so it can be recovered', () => {
    deleteHouseholderContact('a')
    const [tombstone] = useContacts.getState().deletedContacts

    expect(tombstone.name).toBe('Name a')
    expect(tombstone.address?.line1).toBe('12 Oak St')
    expect(tombstone.redacted).toBeUndefined()
    expect(useConversations.getState().conversations).toHaveLength(3)

    useContacts.getState().recoverContact('a')
    expect(
      useContacts
        .getState()
        .contacts.map((c) => c.id)
        .sort()
    ).toEqual(['a', 'b'])
  })
})

describe('deleteAllHouseholderData', () => {
  beforeEach(() => reset(false))

  it('erases every contact and visit regardless of the mode', () => {
    const result = deleteAllHouseholderData()

    expect(result).toEqual({ contacts: 2, visits: 3 })
    expect(useContacts.getState().contacts).toEqual([])
    expect(useConversations.getState().conversations).toEqual([])
    expect(
      useContacts.getState().deletedContacts.every(isRedactedContactTombstone)
    ).toBe(true)
    expect(
      useConversations
        .getState()
        .deletedConversations.map((t) => t.id)
        .sort()
    ).toEqual(['v1', 'v2', 'v3'])
  })

  it('redacts tombstones left behind by an earlier soft delete', () => {
    deleteHouseholderContact('a')
    expect(useContacts.getState().deletedContacts[0].name).toBe('Name a')

    deleteAllHouseholderData()

    const tombstones = useContacts.getState().deletedContacts
    expect(tombstones).toHaveLength(2)
    expect(tombstones.every(isRedactedContactTombstone)).toBe(true)
    expect(JSON.stringify(tombstones)).not.toContain('Name a')
  })
})

describe('householder address cache', () => {
  beforeEach(() => reset(false))

  it('clears the address and timestamp when protection is enabled, without changing the prefill preference', () => {
    usePreferences.getState().set({
      dataProtectionMode: true,
      dataProtectionModeSetByUser: true,
    })
    usePreferences.getState().set({ dataProtectionMode: false })

    expect(usePreferences.getState().prefillAddress).toEqual({
      enabled: true,
      address: undefined,
      lastUpdated: undefined,
    })
  })

  it('also clears the cache when onboarding applies the regional default', () => {
    usePreferences.getState().set({ dataProtectionMode: true })

    expect(usePreferences.getState().prefillAddress.address).toBeUndefined()
    expect(usePreferences.getState().prefillAddress.lastUpdated).toBeUndefined()
    expect(usePreferences.getState().dataProtectionModeSetByUser).toBe(false)
  })

  it.each([false, true])(
    'erases the cached address even with no contacts (protection: %s)',
    (dataProtectionMode) => {
      reset(dataProtectionMode)
      useContacts.setState({ contacts: [], deletedContacts: [] })
      useConversations.setState({ conversations: [] })

      expect(deleteAllHouseholderData()).toEqual({ contacts: 0, visits: 0 })
      expect(usePreferences.getState().prefillAddress.address).toBeUndefined()
      expect(
        usePreferences.getState().prefillAddress.lastUpdated
      ).toBeUndefined()
    }
  )
})

describe('contact consent updates', () => {
  beforeEach(() => reset(true))

  it('persists an explicit consent withdrawal across serialization and later edits', () => {
    const contact = useContacts.getState().contacts[0]
    useContacts
      .getState()
      .updateContact({ ...contact, consentGivenAt: undefined })

    // Simulate the JSON round trip used by persistence and sync.
    const saved = JSON.parse(JSON.stringify(useContacts.getState().contacts))
    useContacts.setState({ contacts: saved })
    useContacts
      .getState()
      .updateContact({ id: contact.id, name: 'Updated name' })

    expect(useContacts.getState().contacts[0].consentGivenAt).toBeUndefined()
    expect(useContacts.getState().contacts[0].name).toBe('Updated name')
  })

  it('preserves recorded consent when an unrelated partial update omits it', () => {
    useContacts.getState().updateContact({ id: 'a', name: 'Updated name' })
    expect(useContacts.getState().contacts[0].consentGivenAt).toBe(
      '2026-01-01T00:00:00.000Z'
    )
  })
})
