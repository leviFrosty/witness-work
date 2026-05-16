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

describe('mergePayload — categoryStore', () => {
  it('merges remote-only Categories into local state', () => {
    const local = emptyLocal()
    const remote = makeRemote({
      categoryStore: {
        categories: [
          {
            id: 'cat-1',
            name: 'Bethel',
            isCredit: true,
            updatedAt: 1700000001000,
          },
        ],
      },
    })

    const result = mergePayload(local, remote)
    expect(result.categories).toHaveLength(1)
    expect(result.categories[0].name).toBe('Bethel')
    expect(result.changed).toBe(true)
  })

  it('keeps the local Category when its updatedAt is newer', () => {
    const local = emptyLocal()
    local.categories = [
      {
        id: 'cat-1',
        name: 'Bethel (local rename)',
        isCredit: true,
        updatedAt: 1700000002000,
      },
    ]
    const remote = makeRemote({
      categoryStore: {
        categories: [
          {
            id: 'cat-1',
            name: 'Bethel',
            isCredit: true,
            updatedAt: 1700000001000,
          },
        ],
      },
    })

    const result = mergePayload(local, remote)
    expect(result.categories[0].name).toBe('Bethel (local rename)')
  })

  it('overwrites the local Category when the remote updatedAt is newer', () => {
    const local = emptyLocal()
    local.categories = [
      {
        id: 'cat-1',
        name: 'Bethel',
        isCredit: false,
        updatedAt: 1700000001000,
      },
    ]
    const remote = makeRemote({
      categoryStore: {
        categories: [
          {
            id: 'cat-1',
            name: 'Bethel',
            isCredit: true,
            updatedAt: 1700000002000,
          },
        ],
      },
    })

    const result = mergePayload(local, remote)
    expect(result.categories[0].isCredit).toBe(true)
  })

  it('applies a remote tombstone when it post-dates the local record', () => {
    // Use timestamps inside the 90-day tombstone retention window so the
    // tombstone isn't pruned before it can be applied.
    const recent = Date.now() - 1000 * 60 * 60 * 24 // 1 day ago
    const local = emptyLocal()
    local.categories = [
      {
        id: 'cat-1',
        name: 'Bethel',
        isCredit: true,
        updatedAt: recent - 60_000,
      },
    ]
    const remote = makeRemote({
      categoryStore: {
        categories: [],
        deletedCategories: [{ id: 'cat-1', deletedAt: recent }],
      },
    })

    const result = mergePayload(local, remote)
    expect(result.categories).toHaveLength(0)
    expect(result.deletedCategories.find((t) => t.id === 'cat-1')).toBeDefined()
  })

  it('tolerates remote payloads with no categoryStore field (pre-Category clients)', () => {
    const local = emptyLocal()
    local.categories = [
      {
        id: 'cat-1',
        name: 'Bethel',
        isCredit: false,
        updatedAt: 1700000001000,
      },
    ]
    // No categoryStore on the payload at all — older app version.
    const remote = makeRemote({})

    const result = mergePayload(local, remote)
    expect(result.categories).toHaveLength(1)
    expect(result.categories[0].name).toBe('Bethel')
  })
})
