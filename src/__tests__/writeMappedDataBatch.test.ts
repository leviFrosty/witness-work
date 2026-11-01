import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid' }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
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
vi.mock('@/lib/locales', () => ({ default: { t: (k: string) => k } }))
vi.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: vi.fn(),
}))
vi.mock('@/lib/contactAvatarFiles', () => ({
  deleteAvatarFiles: vi.fn(async () => {}),
}))

const clock = vi.hoisted(() => ({ now: 0 }))
vi.mock('@/lib/syncClock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/syncClock')>()),
  syncTimestamp: (previous = 0) => {
    clock.now = Math.max(clock.now + 1, previous + 1)
    return clock.now
  },
}))

import { PersistStorage } from '@/stores/mmkv'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences, PREFERENCE_DEFAULTS } from '@/stores/preferences'
import { writeMappedDataToStores } from '@/lib/import/writeMappedData'
import { stripContactForTombstone } from '@/lib/dataProtection'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { MappedImport } from '@/lib/import/types'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'

const AT = new Date('2026-06-08T12:00:00.000Z')

const aContact = (id: string, name = 'Jane'): Contact => ({
  id,
  name,
  createdAt: AT,
  customFields: { 'field-live': 'x', 'field-gone': 'y' },
})
const aVisit = (id: string, contactId: string): Visit => ({
  id,
  contact: { id: contactId },
  date: AT,
  isBibleStudy: false,
  customFields: { 'visit-field-gone': 'z' },
})
const anEntry = (id: string, date: Date): TimeEntry => ({
  id,
  hours: 1,
  minutes: 15,
  date,
})

const bigImport = (count: number): MappedImport => ({
  contacts: Array.from({ length: count }, (_, i) => aContact(`c${i}`)),
  visits: Array.from({ length: count }, (_, i) => aVisit(`v${i}`, `c${i}`)),
  timeEntries: Array.from({ length: count }, (_, i) =>
    anEntry(`t${i}`, new Date(Date.UTC(2024, 0, 1 + (i % 700), 9)))
  ),
  categories: [],
  customFieldDefs: [],
  publisher: null,
})

const seedStores = () => {
  useContacts.setState({
    contacts: [{ ...aContact('c0', 'Already here'), updatedAt: 5 }],
    deletedContacts: [
      { ...aContact('c1', 'Archived'), updatedAt: 6 },

      stripContactForTombstone(aContact('c2'), 500),
    ],
    deletedCustomFieldDefs: [{ id: 'field-gone', deletedAt: 1 }],
  })
  useConversations.setState({
    conversations: [{ ...aVisit('v0', 'c0'), updatedAt: 7 }],
    deletedConversationFieldDefs: [{ id: 'visit-field-gone', deletedAt: 1 }],
  })
  useServiceReport.setState({
    serviceReports: {
      2024: {
        0: [
          {
            ...anEntry('t0', normalizeDateForStorage(new Date(2024, 0, 1))),
            updatedAt: 8,
          },
        ],
      },
    },
  })
}

const writePerItem = (mapped: MappedImport) => {
  const existingContactIds = new Set(
    [
      ...useContacts.getState().contacts,
      ...useContacts.getState().deletedContacts.filter((c) => !c.redacted),
    ].map((c) => c.id)
  )
  for (const contact of mapped.contacts) {
    if (existingContactIds.has(contact.id)) continue
    useContacts.getState().addContact(contact)
    existingContactIds.add(contact.id)
  }
  const existingVisitIds = new Set(
    useConversations.getState().conversations.map((v) => v.id)
  )
  for (const visit of mapped.visits) {
    if (existingVisitIds.has(visit.id)) continue
    useConversations.getState().addConversation(visit)
    existingVisitIds.add(visit.id)
  }
  const seen = new Set(
    Object.values(useServiceReport.getState().serviceReports)
      .flatMap((y) => Object.values(y))
      .flat()
      .map((e) => e.id)
  )
  for (const entry of mapped.timeEntries) {
    if (seen.has(entry.id)) continue
    useServiceReport.getState().addServiceReport(entry)
    seen.add(entry.id)
  }
}

const snapshot = () => ({
  contacts: useContacts.getState().contacts,
  deletedContacts: useContacts.getState().deletedContacts,
  conversations: useConversations.getState().conversations,
  serviceReports: useServiceReport.getState().serviceReports,
})

beforeEach(() => {
  clock.now = 1000
  useContacts.getState().set({
    contacts: [],
    deletedContacts: [],
    customFieldDefs: [],
    deletedCustomFieldDefs: [],
  })
  useConversations.getState()._WARNING_forceDeleteConversations()
  useConversations.setState({ deletedConversationFieldDefs: [] })
  useServiceReport.getState()._WARNING_forceDeleteServiceReports()
  useCategories.getState()._WARNING_forceDeleteCategories()
  usePreferences.setState({ ...PREFERENCE_DEFAULTS, preferenceUpdatedAt: {} })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('writeMappedDataToStores — batched writes', () => {
  it('persists each record store once, however many records it imports', () => {
    const setItem = vi.spyOn(PersistStorage, 'setItem')
    const commit = writeMappedDataToStores(bigImport(2000), {
      publisherMode: 'overwrite',
    })

    expect(commit.insertedContactIds).toHaveLength(2000)
    expect(commit.insertedVisitIds).toHaveLength(2000)
    expect(commit.insertedTimeEntries).toHaveLength(2000)
    const writesTo = (name: string) =>
      setItem.mock.calls.filter(([key]) => key === name).length
    expect(writesTo('contacts')).toBe(1)
    expect(writesTo('conversations')).toBe(1)
    expect(writesTo('serviceReports')).toBe(1)
  })

  it('leaves the stores exactly as one write per record did', () => {
    const mapped = bigImport(40)

    mapped.contacts.push(aContact('c5', 'Duplicate'))
    mapped.visits.push(aVisit('v5', 'c5'))
    mapped.timeEntries.push(anEntry('t5', AT))

    seedStores()
    writePerItem(mapped)
    const perItem = snapshot()

    clock.now = 1000
    seedStores()
    const commit = writeMappedDataToStores(mapped, {
      publisherMode: 'overwrite',
    })

    expect(snapshot()).toEqual(perItem)

    expect(commit.insertedContactIds).toEqual(
      mapped.contacts.slice(2, 40).map((c) => c.id)
    )
    expect(commit.insertedVisitIds).toEqual(
      mapped.visits.slice(1, 40).map((v) => v.id)
    )
    expect(commit.insertedTimeEntries.map((e) => e.id)).toEqual(
      mapped.timeEntries.slice(1, 40).map((e) => e.id)
    )
    expect(useContacts.getState().deletedContacts.map((c) => c.id)).toEqual([
      'c1',
    ])
  })
})

describe('addServiceReport', () => {
  it('does not mutate the previous state', () => {
    const date = normalizeDateForStorage(new Date(2024, 0, 10))
    useServiceReport.getState().addServiceReport(anEntry('first', date))
    const before = useServiceReport.getState().serviceReports
    const frozen: TimeEntriesByYear = structuredClone(before)

    useServiceReport.getState().addServiceReport(anEntry('second', date))
    useServiceReport.getState().addServiceReports([anEntry('third', date)])

    expect(before).toEqual(frozen)
    expect(
      useServiceReport.getState().serviceReports[2024][0].map((e) => e.id)
    ).toEqual(['first', 'second', 'third'])
  })
})
