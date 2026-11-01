import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn(), addBreadcrumb: vi.fn() },
}))
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
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import { usePreferences } from '@/stores/preferences'
import useCategories from '@/stores/categories'
import useContacts from '@/stores/contactsStore'
import useServiceReport from '@/stores/serviceReport'
import { runTagsToCategoriesMigration } from '@/stores/migrations/categories'
import { runCustomFieldsMigration } from '@/features/contacts/lib/runCustomFieldsMigration'
import type { Contact } from '@/types/contact'
import type { TimeEntry } from '@/types/timeEntry'

const contact = (customFields: Record<string, string>): Contact =>
  ({
    id: 'contact-1',
    name: 'Ada Example',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    customFields,
  }) as Contact

beforeEach(() => {
  useCategories.setState({ categories: [], deletedCategories: [] })
  useContacts.setState({
    contacts: [],
    deletedContacts: [],
    customFieldDefs: [],
    deletedCustomFieldDefs: [],
  })
  useServiceReport.setState({ serviceReports: {} })
})

describe('runTagsToCategoriesMigration', () => {
  it('keeps existing Categories when its flag reads false', () => {
    useCategories.setState({
      categories: [{ id: 'c1', name: 'Bethel', isCredit: true, updatedAt: 5 }],
      deletedCategories: [{ id: 'gone', deletedAt: 9 }],
    })
    usePreferences.setState({ hasMigratedTagsToCategories: false })
    runTagsToCategoriesMigration()
    expect(useCategories.getState().categories.map(({ id }) => id)).toEqual([
      'c1',
    ])
    expect(useCategories.getState().deletedCategories).toEqual([
      { id: 'gone', deletedAt: 9 },
    ])
    expect(usePreferences.getState().hasMigratedTagsToCategories).toBe(true)
  })

  it('keeps Category tombstones when every Category was deleted', () => {
    useCategories.setState({
      deletedCategories: [{ id: 'gone', deletedAt: 9 }],
    })
    usePreferences.setState({ hasMigratedTagsToCategories: false })
    runTagsToCategoriesMigration()
    expect(useCategories.getState().deletedCategories).toEqual([
      { id: 'gone', deletedAt: 9 },
    ])
  })

  it('still turns legacy tags into Categories', () => {
    useServiceReport.setState({
      serviceReports: {
        2026: {
          0: [
            {
              id: 'entry-1',
              hours: 1,
              minutes: 0,
              date: new Date('2026-01-05T12:00:00.000Z'),
              tag: 'Bethel',
              credit: true,
            } as TimeEntry & { tag: string },
          ],
        },
      },
    })
    usePreferences.setState({ hasMigratedTagsToCategories: false })
    runTagsToCategoriesMigration()
    const [category] = useCategories.getState().categories
    expect(category).toMatchObject({ name: 'Bethel', isCredit: true })
    expect(
      useServiceReport.getState().serviceReports[2026][0][0].categoryId
    ).toBe(category.id)
    expect(usePreferences.getState().hasMigratedTagsToCategories).toBe(true)
  })
})

describe('runCustomFieldsMigration', () => {
  it('keeps existing field definitions when its flag reads false', () => {
    const def = {
      id: 'field-1',
      label: 'Language',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    }
    useContacts.setState({
      contacts: [contact({ 'field-1': 'Spanish' })],
      customFieldDefs: [def],
    })
    usePreferences.setState({ hasMigratedCustomFieldsToIds: false })
    runCustomFieldsMigration()
    expect(useContacts.getState().customFieldDefs).toEqual([def])
    expect(useContacts.getState().contacts[0].customFields).toEqual({
      'field-1': 'Spanish',
    })
    expect(usePreferences.getState().hasMigratedCustomFieldsToIds).toBe(true)
  })

  it('keeps field tombstones when every field was deleted', () => {
    useContacts.setState({
      deletedCustomFieldDefs: [{ id: 'field-1', deletedAt: 9 }],
    })
    usePreferences.setState({ hasMigratedCustomFieldsToIds: false })
    runCustomFieldsMigration()
    expect(useContacts.getState().deletedCustomFieldDefs).toEqual([
      { id: 'field-1', deletedAt: 9 },
    ])
    expect(useContacts.getState().customFieldDefs).toEqual([])
  })

  it('still turns legacy labels into field definitions', () => {
    useContacts.setState({ contacts: [contact({ Language: 'Spanish' })] })
    usePreferences.setState({
      hasMigratedCustomFieldsToIds: false,
      ...({ customContactFields: ['Language'] } as object),
    })
    runCustomFieldsMigration()
    const [def] = useContacts.getState().customFieldDefs
    expect(def).toMatchObject({ label: 'Language' })
    expect(useContacts.getState().contacts[0].customFields).toEqual({
      [def.id]: 'Spanish',
    })
    expect(usePreferences.getState().hasMigratedCustomFieldsToIds).toBe(true)
  })
})
