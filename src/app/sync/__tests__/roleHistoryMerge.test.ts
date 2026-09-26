import { describe, expect, it } from 'vitest'
import { mergePayload } from '@/app/sync/merge'
import { SyncPayload } from '@/app/sync/payload'
import { Category, CategoryTombstone } from '@/types/category'

type LocalState = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contacts: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deletedContacts: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customFieldDefs: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deletedCustomFieldDefs: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversations: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deletedConversations: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceReports: Record<string, Record<string, any[]>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dayPlans: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recurringPlans: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deletedServiceReports: any[]
  categories: Category[]
  deletedCategories: CategoryTombstone[]
  preferencesValues: Record<string, unknown>
  preferenceUpdatedAt: Record<string, number>
  profileValues: Record<string, unknown>
  profileUpdatedAt: Record<string, number>
}

const emptyLocal = (): LocalState => ({
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

const makeRemote = (overrides: Partial<SyncPayload> = {}): SyncPayload => ({
  version: 1,
  writtenAt: 1700000000000,
  deviceId: 'remote-device',
  contactStore: { contacts: [], deletedContacts: [] },
  conversationStore: { conversations: [], deletedConversations: [] },
  serviceReportStore: {
    serviceReports: {},
    dayPlans: [],
    recurringPlans: [],
    deletedServiceReports: [],
  },
  preferencesStore: { values: {}, updatedAt: {} },
  ...overrides,
})

describe('mergePayload — Role History', () => {
  const history = {
    initial: 'publisher',
    changes: { '2025-09': 'regularPioneer' },
  }

  it('takes role and roleHistory together from the newer side', () => {
    const local = emptyLocal()
    local.preferencesValues = { role: 'publisher', roleHistory: null }
    local.preferenceUpdatedAt = { role: 100, roleHistory: 100 }
    const remote = makeRemote({
      preferencesStore: {
        values: { role: 'regularPioneer', roleHistory: history },
        updatedAt: { roleHistory: 200 },
      },
    })

    const merged = mergePayload(local, remote)
    expect(merged.preferencesValues.role).toBe('regularPioneer')
    expect(merged.preferencesValues.roleHistory).toEqual(history)
    expect(merged.preferenceUpdatedAt.role).toBe(200)
  })

  it('clears Role History when a peer without it changes the role', () => {
    const local = emptyLocal()
    local.preferencesValues = { role: 'regularPioneer', roleHistory: history }
    local.preferenceUpdatedAt = { role: 100, roleHistory: 100 }
    const remote = makeRemote({
      preferencesStore: {
        values: { role: 'circuitOverseer' },
        updatedAt: { role: 200 },
      },
    })

    const merged = mergePayload(local, remote)
    expect(merged.preferencesValues.role).toBe('circuitOverseer')
    expect(merged.preferencesValues.roleHistory).toBeNull()
  })

  it('keeps the local pair when it is newer', () => {
    const local = emptyLocal()
    local.preferencesValues = { role: 'regularPioneer', roleHistory: history }
    local.preferenceUpdatedAt = { role: 300, roleHistory: 300 }
    const remote = makeRemote({
      preferencesStore: {
        values: { role: 'publisher', roleHistory: null },
        updatedAt: { role: 200, roleHistory: 200 },
      },
    })

    const merged = mergePayload(local, remote)
    expect(merged.preferencesValues.role).toBe('regularPioneer')
    expect(merged.preferencesValues.roleHistory).toEqual(history)
  })
})
