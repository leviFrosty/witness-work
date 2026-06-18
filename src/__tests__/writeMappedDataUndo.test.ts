import { describe, it, expect, beforeEach, vi } from 'vitest'

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
vi.mock('expo-device', () => ({ DeviceType: { TABLET: 2 }, deviceType: 1 }))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({ default: { t: (k: string) => k } }))
vi.mock('@/shaders/registry', () => ({ DEFAULT_SHADER_ID: 'holographic' }))
vi.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: vi.fn(),
}))

import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences, PREFERENCE_DEFAULTS } from '@/stores/preferences'
import { useTimeCache } from '@/stores/timeCache'
import {
  writeMappedDataToStores,
  undoImport,
} from '@/lib/import/writeMappedData'
import type { MappedImport } from '@/lib/import/types'
import type { Contact } from '@/types/contact'

const AT = new Date('2026-06-08T12:00:00.000Z')

const aContact = (id: string, name = 'Jane'): Contact => ({
  id,
  name,
  createdAt: AT,
})

const emptyMapped = (): MappedImport => ({
  contacts: [],
  visits: [],
  timeEntries: [],
  categories: [],
  customFieldDefs: [],
  publisher: null,
})

beforeEach(() => {
  useContacts
    .getState()
    .set({ contacts: [], deletedContacts: [], customFieldDefs: [] })
  useConversations.getState()._WARNING_forceDeleteConversations()
  useServiceReport.getState()._WARNING_forceDeleteServiceReports()
  useCategories.getState()._WARNING_forceDeleteCategories()
  usePreferences.setState({ ...PREFERENCE_DEFAULTS, preferenceUpdatedAt: {} })
  useTimeCache.getState().invalidateAllCache()
})

const sampleImport = (): MappedImport => ({
  ...emptyMapped(),
  contacts: [aContact('notes-h-c-c1', 'Maria')],
  visits: [
    {
      id: 'notes-h-v-v1',
      contact: { id: 'notes-h-c-c1' },
      date: AT,
      isBibleStudy: false,
    },
  ],
  timeEntries: [{ id: 'notes-h-t-t1', hours: 1, minutes: 30, date: AT }],
  categories: [{ id: 'notes-h-cat-bethel', name: 'Bethel', isCredit: true }],
})

describe('writeMappedDataToStores — insertion tracking', () => {
  it('returns exactly the ids it inserted', () => {
    const commit = writeMappedDataToStores(sampleImport(), {
      publisherMode: 'overwrite',
    })
    expect(commit.insertedContactIds).toEqual(['notes-h-c-c1'])
    expect(commit.insertedVisitIds).toEqual(['notes-h-v-v1'])
    expect(commit.insertedTimeEntries.map((e) => e.id)).toEqual([
      'notes-h-t-t1',
    ])
    expect(commit.insertedCategoryIds).toEqual(['notes-h-cat-bethel'])
  })

  it('does not count a pre-existing record as inserted', () => {
    useContacts.getState().addContact(aContact('notes-h-c-c1', 'Maria'))
    const commit = writeMappedDataToStores(sampleImport(), {
      publisherMode: 'overwrite',
    })
    expect(commit.insertedContactIds).toEqual([])
  })
})

describe('undoImport', () => {
  it('removes exactly the inserted records, leaving stores empty', () => {
    const commit = writeMappedDataToStores(sampleImport(), {
      publisherMode: 'overwrite',
    })
    undoImport(commit)

    expect(useContacts.getState().contacts).toHaveLength(0)
    expect(useContacts.getState().deletedContacts).toHaveLength(0)
    expect(useConversations.getState().conversations).toHaveLength(0)
    expect(useCategories.getState().categories).toHaveLength(0)
    const reports = useServiceReport.getState().serviceReports
    const allEntries = Object.values(reports).flatMap((y) =>
      Object.values(y).flat()
    )
    expect(allEntries).toHaveLength(0)
  })

  it('leaves a pre-existing record untouched on undo', () => {
    useContacts.getState().addContact(aContact('pre-existing', 'Bob'))
    const mapped: MappedImport = {
      ...emptyMapped(),
      contacts: [
        aContact('pre-existing', 'Bob'),
        aContact('notes-h-c-c1', 'Maria'),
      ],
    }
    const commit = writeMappedDataToStores(mapped, {
      publisherMode: 'overwrite',
    })
    undoImport(commit)

    const remaining = useContacts.getState().contacts.map((c) => c.id)
    expect(remaining).toEqual(['pre-existing'])
  })

  it('restores the prior publisher role + tenure', () => {
    expect(usePreferences.getState().role).toBe(PREFERENCE_DEFAULTS.role)
    const commit = writeMappedDataToStores(
      {
        ...emptyMapped(),
        publisher: { role: 'regularPioneer', tenureStartDate: AT },
      },
      { publisherMode: 'overwrite' }
    )
    expect(usePreferences.getState().role).toBe('regularPioneer')

    undoImport(commit)
    expect(usePreferences.getState().role).toBe(PREFERENCE_DEFAULTS.role)
    expect(usePreferences.getState().tenureStartDate).toBeNull()
  })
})
