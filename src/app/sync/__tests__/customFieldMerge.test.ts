import { describe, expect, it } from 'vitest'
import { mergePayload } from '@/app/sync/merge'
import type { SyncPayload } from '@/app/sync/payload'
import type { Contact } from '@/types/contact'
import type {
  CustomFieldDefinition,
  CustomFieldTombstone,
} from '@/types/customField'
import type { Category, CategoryTombstone } from '@/types/category'
import type { Visit, VisitTombstone } from '@/types/visit'
import type {
  DayPlan,
  TimeEntriesByYear,
  TimeEntryTombstone,
} from '@/types/timeEntry'
import type { RecurringPlan } from '@/lib/serviceReport'

type LocalState = {
  contacts: Contact[]
  deletedContacts: Contact[]
  customFieldDefs: CustomFieldDefinition[]
  deletedCustomFieldDefs: CustomFieldTombstone[]
  conversations: Visit[]
  deletedConversations: VisitTombstone[]
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  deletedServiceReports: TimeEntryTombstone[]
  categories: Category[]
  deletedCategories: CategoryTombstone[]
  preferencesValues: Record<string, unknown>
  preferenceUpdatedAt: Record<string, number>
  profileValues: Record<string, unknown>
  profileUpdatedAt: Record<string, number>
}

const baseLocal = (): LocalState => ({
  contacts: [],
  deletedContacts: [],
  customFieldDefs: [],
  deletedCustomFieldDefs: [],
  conversations: [],
  deletedConversations: [],
  serviceReports: {},
  dayPlans: [],
  recurringPlans: [],
  deletedServiceReports: [],
  categories: [],
  deletedCategories: [],
  preferencesValues: {},
  preferenceUpdatedAt: {},
  profileValues: {},
  profileUpdatedAt: {},
})

const remote = (
  contactStore: Partial<SyncPayload['contactStore']>
): SyncPayload => ({
  version: 1,
  writtenAt: Date.now(),
  deviceId: 'remote-device',
  contactStore: {
    contacts: [],
    deletedContacts: [],
    ...contactStore,
  },
  conversationStore: { conversations: [], deletedConversations: [] },
  serviceReportStore: {
    serviceReports: {},
    dayPlans: [],
    recurringPlans: [],
    deletedServiceReports: [],
  },
  preferencesStore: { values: {}, updatedAt: {} },
})

const deletedAt = Date.now() - 1_000
const field = {
  id: 'field-language',
  label: 'Language',
  order: 0,
  createdAt: deletedAt - 10_000,
  updatedAt: deletedAt - 5_000,
}

describe('mergePayload — custom field purge', () => {
  it('applies a remote tombstone to local definitions and both contact lists', () => {
    const local = baseLocal()
    local.customFieldDefs = [field]
    local.contacts = [
      {
        id: 'active-contact',
        name: 'Active',
        createdAt: new Date(),
        customFields: { [field.id]: 'Spanish', keep: 'active' },
      },
    ]
    local.deletedContacts = [
      {
        id: 'deleted-contact',
        name: 'Deleted',
        createdAt: new Date(),
        customFields: { [field.id]: 'French', keep: 'deleted' },
      },
    ]

    const result = mergePayload(
      local,
      remote({
        deletedCustomFieldDefs: [{ id: field.id, deletedAt }],
      })
    )

    expect(result.customFieldDefs).toEqual([])
    expect(result.contacts[0].customFields).toEqual({ keep: 'active' })
    expect(result.deletedContacts[0].customFields).toEqual({ keep: 'deleted' })
  })

  it('propagates a newer tombstone timestamp even when the list length is unchanged', () => {
    const local = baseLocal()
    local.deletedCustomFieldDefs = [{ id: field.id, deletedAt }]
    const newer = deletedAt + 10_000

    const result = mergePayload(
      local,
      remote({
        deletedCustomFieldDefs: [{ id: field.id, deletedAt: newer }],
      })
    )

    expect(result.deletedCustomFieldDefs).toEqual([
      { id: field.id, deletedAt: newer },
    ])
    expect(result.changed).toBe(true)
  })

  it('blocks stale definitions and values from returning after purge', () => {
    const local = baseLocal()
    local.deletedCustomFieldDefs = [{ id: field.id, deletedAt }]

    const result = mergePayload(
      local,
      remote({
        customFieldDefs: [field],
        contacts: [
          {
            id: 'contact-1',
            name: 'Stale',
            createdAt: new Date(),
            updatedAt: deletedAt + 10_000,
            customFields: { [field.id]: 'stale value', keep: 'keep' },
          },
        ],
      })
    )

    expect(result.customFieldDefs).toEqual([])
    expect(result.deletedCustomFieldDefs).toEqual([{ id: field.id, deletedAt }])
    expect(result.contacts[0].customFields).toEqual({ keep: 'keep' })
  })

  it('reconciles active/deleted contact winners before stripping values', () => {
    const local = baseLocal()
    local.deletedCustomFieldDefs = [{ id: field.id, deletedAt }]
    local.contacts = [
      {
        id: 'contact-1',
        name: 'Older active copy',
        createdAt: new Date(),
        updatedAt: deletedAt - 10_000,
        customFields: { [field.id]: 'stale value' },
      },
    ]
    local.deletedContacts = [
      {
        id: 'contact-1',
        name: 'Newer deleted copy',
        createdAt: new Date(),
        updatedAt: deletedAt - 5_000,
      },
    ]

    const result = mergePayload(local, remote({}))

    expect(result.contacts).toEqual([])
    expect(result.deletedContacts).toHaveLength(1)
    expect(result.deletedContacts[0].name).toBe('Newer deleted copy')
  })

  it('reports cleanup when a local tombstone accompanies a stale definition', () => {
    const local = baseLocal()
    local.customFieldDefs = [field]
    local.deletedCustomFieldDefs = [{ id: field.id, deletedAt }]

    const result = mergePayload(local, remote({}))

    expect(result.customFieldDefs).toEqual([])
    expect(result.changed).toBe(true)
  })

  it('preserves an unstamped legacy contact timestamp during cleanup', () => {
    const local = baseLocal()
    local.deletedCustomFieldDefs = [{ id: field.id, deletedAt }]
    local.contacts = [
      {
        id: 'legacy-contact',
        name: 'Legacy',
        createdAt: new Date(),
        customFields: { [field.id]: 'stale value' },
      },
    ]

    const result = mergePayload(local, remote({}))

    expect(result.contacts[0].customFields).toEqual({})
    expect(result.contacts[0].updatedAt).toBeUndefined()
  })
})
