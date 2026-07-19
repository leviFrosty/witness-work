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
vi.mock('@/lib/locales', () => ({
  default: { t: (k: string) => k },
}))

import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences, PREFERENCE_DEFAULTS } from '@/stores/preferences'
import { useTimeCache } from '@/stores/timeCache'
import { writeMappedDataToStores } from '@/features/mytime-import/lib/importMytime'
import type { MappedImport } from '@/features/mytime-import/lib/mapMytimeData'
import type { Contact } from '@/types/contact'

const emptyMapped = (): MappedImport => ({
  contacts: [],
  visits: [],
  timeEntries: [],
  categories: [],
  customFieldDefs: [],
  publisher: null,
})

const aContact = (id: string): Contact => ({
  id,
  name: 'Jane',
  gender: 'unknown',
  createdAt: new Date('2026-06-08T12:00:00.000Z'),
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

describe('writeMappedDataToStores', () => {
  it('writes mapped contacts into the contacts store', () => {
    writeMappedDataToStores(
      { ...emptyMapped(), contacts: [aContact('mytime-call-1')] },
      { publisherMode: 'overwrite' }
    )

    expect(useContacts.getState().contacts.map((c) => c.id)).toEqual([
      'mytime-call-1',
    ])
  })

  it('writes visits, time entries, categories, and custom field defs', () => {
    writeMappedDataToStores(
      {
        ...emptyMapped(),
        visits: [
          {
            id: 'mytime-rv-1',
            contact: { id: 'mytime-call-1' },
            date: new Date('2025-01-15T12:00:00.000Z'),
            isBibleStudy: false,
          },
        ],
        timeEntries: [
          {
            id: 'mytime-hours-202509',
            hours: 50,
            minutes: 0,
            date: new Date('2025-09-01T12:00:00.000Z'),
          },
        ],
        categories: [
          { id: 'cat-1', name: 'Bethel', isCredit: true, updatedAt: 1 },
        ],
        customFieldDefs: [
          {
            id: 'mytime-infotype-5',
            label: 'Best time',
            order: 0,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      { publisherMode: 'overwrite' }
    )

    expect(useConversations.getState().conversations.map((c) => c.id)).toEqual([
      'mytime-rv-1',
    ])
    expect(useServiceReport.getState().serviceReports[2025][8]).toHaveLength(1)
    expect(useCategories.getState().categories.map((c) => c.id)).toEqual([
      'cat-1',
    ])
    expect(useContacts.getState().customFieldDefs.map((d) => d.id)).toEqual([
      'mytime-infotype-5',
    ])
  })

  it('is idempotent — re-importing the same data creates no duplicates', () => {
    const mapped: MappedImport = {
      ...emptyMapped(),
      contacts: [aContact('mytime-call-1')],
      visits: [
        {
          id: 'mytime-rv-1',
          contact: { id: 'mytime-call-1' },
          date: new Date('2025-01-15T12:00:00.000Z'),
          isBibleStudy: false,
        },
      ],
      timeEntries: [
        {
          id: 'mytime-hours-202509',
          hours: 50,
          minutes: 0,
          date: new Date('2025-09-01T12:00:00.000Z'),
        },
      ],
      categories: [
        { id: 'cat-1', name: 'Bethel', isCredit: true, updatedAt: 1 },
      ],
    }

    writeMappedDataToStores(mapped, { publisherMode: 'overwrite' })
    writeMappedDataToStores(mapped, { publisherMode: 'overwrite' })

    expect(useContacts.getState().contacts).toHaveLength(1)
    expect(useConversations.getState().conversations).toHaveLength(1)
    expect(useServiceReport.getState().serviceReports[2025][8]).toHaveLength(1)
    expect(useCategories.getState().categories).toHaveLength(1)
  })
})

describe('writeMappedDataToStores — publisher (decision 4)', () => {
  const TENURE = new Date('2018-09-01T12:00:00.000Z')

  const importPublisher = (
    publisher: MappedImport['publisher'],
    publisherMode: 'overwrite' | 'fillIfUnset'
  ) =>
    writeMappedDataToStores({ ...emptyMapped(), publisher }, { publisherMode })

  it('overwrite mode sets role and tenure on a fresh profile', () => {
    importPublisher(
      { role: 'regularPioneer', tenureStartDate: TENURE },
      'overwrite'
    )

    expect(usePreferences.getState().role).toBe('regularPioneer')
    expect(usePreferences.getState().tenureStartDate).toEqual(TENURE)
  })

  it('overwrite mode clobbers an existing role and tenure', () => {
    usePreferences.setState({
      role: 'circuitOverseer',
      tenureStartDate: new Date('2010-01-01T12:00:00.000Z'),
    })

    importPublisher(
      { role: 'regularAuxiliary', tenureStartDate: TENURE },
      'overwrite'
    )

    expect(usePreferences.getState().role).toBe('regularAuxiliary')
    expect(usePreferences.getState().tenureStartDate).toEqual(TENURE)
  })

  it('fillIfUnset fills role and tenure when the profile is pristine', () => {
    importPublisher(
      { role: 'regularPioneer', tenureStartDate: TENURE },
      'fillIfUnset'
    )

    expect(usePreferences.getState().role).toBe('regularPioneer')
    expect(usePreferences.getState().tenureStartDate).toEqual(TENURE)
  })

  it('fillIfUnset never clobbers a role the user already chose', () => {
    const existingTenure = new Date('2010-01-01T12:00:00.000Z')
    usePreferences.setState({
      role: 'specialPioneer',
      tenureStartDate: existingTenure,
    })

    importPublisher(
      { role: 'regularPioneer', tenureStartDate: TENURE },
      'fillIfUnset'
    )

    expect(usePreferences.getState().role).toBe('specialPioneer')
    expect(usePreferences.getState().tenureStartDate).toEqual(existingTenure)
  })

  it('fillIfUnset fills a missing tenure even when the role is already set', () => {
    usePreferences.setState({ role: 'regularPioneer', tenureStartDate: null })

    importPublisher(
      { role: 'regularPioneer', tenureStartDate: TENURE },
      'fillIfUnset'
    )

    expect(usePreferences.getState().role).toBe('regularPioneer')
    expect(usePreferences.getState().tenureStartDate).toEqual(TENURE)
  })

  it('does nothing when there is no publisher in the backup', () => {
    importPublisher(null, 'overwrite')
    expect(usePreferences.getState().role).toBe('publisher')
    expect(usePreferences.getState().tenureStartDate).toBeNull()
  })
})

describe('writeMappedDataToStores — cache', () => {
  it('invalidates the time cache so imported time recomputes', () => {
    useTimeCache.getState().setCachedPlannedMinutes('2025-8', 100, 'hash')
    expect(
      useTimeCache.getState().getCachedPlannedMinutes('2025-8')
    ).toBeDefined()

    writeMappedDataToStores(emptyMapped(), { publisherMode: 'overwrite' })

    expect(
      useTimeCache.getState().getCachedPlannedMinutes('2025-8')
    ).toBeUndefined()
  })
})
