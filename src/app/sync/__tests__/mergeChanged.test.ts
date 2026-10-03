import { describe, expect, it } from 'vitest'
import { mergePayload } from '@/app/sync/merge'
import type { SyncPayload } from '@/app/sync/payload'
import type { Contact } from '@/types/contact'
import type { CustomFieldDefinition } from '@/types/customField'
import type { Visit } from '@/types/visit'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
  type TimeEntry,
} from '@/types/timeEntry'

// `changed` decides whether a pull rewrites every store and pushes, and each
// push makes every device pull again. It must mean "the merged state differs
// from local": a peer's file (a retired device's, say) that still holds records
// deleted here must not report a change, or devices loop.

type LocalState = Parameters<typeof mergePayload>[0]

const NOW = Date.now()
const OLD = NOW - 5_000
const DELETED_AT = NOW - 1_000

const contact = (id: string, updatedAt: number, extra = {}): Contact =>
  ({ id, name: id, createdAt: new Date(0), updatedAt, ...extra }) as Contact
const fieldDef = (id: string, updatedAt: number): CustomFieldDefinition => ({
  id,
  label: id,
  order: 0,
  createdAt: 0,
  updatedAt,
})
const visit = (id: string, updatedAt: number): Visit =>
  ({ id, contact: { id: 'c1' }, date: new Date(0), updatedAt }) as Visit
const entry = (id: string, updatedAt: number): TimeEntry => ({
  id,
  hours: 1,
  minutes: 0,
  date: new Date('2026-09-15T12:00:00.000Z'),
  updatedAt,
})
const dayPlan = (id: string, updatedAt: number): DayPlan => ({
  id,
  date: new Date('2026-10-05T12:00:00.000Z'),
  minutes: 60,
  updatedAt,
})
const recurringPlan = (id: string, updatedAt: number): RecurringPlan => ({
  id,
  startDate: new Date('2026-10-05T12:00:00.000Z'),
  minutes: 90,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
  updatedAt,
})

/** A device with one live record of each kind and one deleted record of each. */
const localState = (): LocalState => ({
  contacts: [contact('c1', OLD)],
  deletedContacts: [contact('c-gone', DELETED_AT)],
  customFieldDefs: [fieldDef('f1', OLD)],
  deletedCustomFieldDefs: [{ id: 'f-gone', deletedAt: DELETED_AT }],
  conversations: [visit('v1', OLD)],
  deletedConversations: [{ id: 'v-gone', deletedAt: DELETED_AT }],
  serviceReports: { 2026: { 8: [entry('e1', OLD)] } },
  dayPlans: [dayPlan('d1', OLD)],
  recurringPlans: [recurringPlan('r1', OLD)],
  deletedServiceReports: [{ id: 'e-gone', deletedAt: DELETED_AT }],
  deletedDayPlans: [{ id: 'd-gone', deletedAt: DELETED_AT }],
  deletedRecurringPlans: [{ id: 'r-gone', deletedAt: DELETED_AT }],
  categories: [{ id: 'k1', name: 'Cart', isCredit: false, updatedAt: OLD }],
  deletedCategories: [{ id: 'k-gone', deletedAt: DELETED_AT }],
  vehicles: [],
  fuels: [],
  fuelPrices: [],
  vehicleSetups: [],
  trips: [],
  deletedMileageRecords: [],
  preferencesValues: { publisher: 'regularPioneer' },
  preferenceUpdatedAt: { publisher: OLD },
  profileValues: { name: 'Levi' },
  profileUpdatedAt: { name: OLD },
})

/**
 * A retired device's file, frozen before this device's deletions: the same live
 * records, plus an older copy of everything deleted here.
 */
const frozenPeer = (): SyncPayload => ({
  version: 1,
  writtenAt: OLD,
  deviceId: 'retired-ipad',
  contactStore: {
    contacts: [contact('c1', OLD), contact('c-gone', OLD)],
    deletedContacts: [],
    customFieldDefs: [fieldDef('f1', OLD), fieldDef('f-gone', OLD)],
    deletedCustomFieldDefs: [],
  },
  conversationStore: {
    conversations: [visit('v1', OLD), visit('v-gone', OLD)],
    deletedConversations: [],
  },
  serviceReportStore: {
    serviceReports: { 2026: { 8: [entry('e1', OLD), entry('e-gone', OLD)] } },
    dayPlans: [dayPlan('d1', OLD), dayPlan('d-gone', OLD)],
    recurringPlans: [recurringPlan('r1', OLD), recurringPlan('r-gone', OLD)],
    deletedServiceReports: [],
  },
  categoryStore: {
    categories: [
      { id: 'k1', name: 'Cart', isCredit: false, updatedAt: OLD },
      { id: 'k-gone', name: 'Old', isCredit: false, updatedAt: OLD },
    ],
    deletedCategories: [],
  },
  preferencesStore: {
    values: { publisher: 'regularPioneer' },
    updatedAt: { publisher: OLD },
  },
  profileStore: { values: { name: 'Levi' }, updatedAt: { name: OLD } },
})

/** Another active device, in step with this one. */
const peerInStep = (): SyncPayload => {
  const local = localState()
  return {
    version: 1,
    writtenAt: OLD,
    deviceId: 'phone',
    contactStore: {
      contacts: local.contacts,
      deletedContacts: local.deletedContacts,
      customFieldDefs: local.customFieldDefs,
      deletedCustomFieldDefs: local.deletedCustomFieldDefs,
    },
    conversationStore: {
      conversations: local.conversations,
      deletedConversations: local.deletedConversations,
    },
    serviceReportStore: {
      serviceReports: local.serviceReports,
      dayPlans: local.dayPlans,
      recurringPlans: local.recurringPlans,
      deletedServiceReports: local.deletedServiceReports,
      deletedDayPlans: local.deletedDayPlans,
      deletedRecurringPlans: local.deletedRecurringPlans,
    },
    categoryStore: {
      categories: local.categories,
      deletedCategories: local.deletedCategories,
    },
    preferencesStore: {
      values: local.preferencesValues,
      updatedAt: local.preferenceUpdatedAt,
    },
    profileStore: {
      values: local.profileValues,
      updatedAt: local.profileUpdatedAt,
    },
  }
}

const collections = [
  'contacts',
  'deletedContacts',
  'customFieldDefs',
  'deletedCustomFieldDefs',
  'conversations',
  'deletedConversations',
  'serviceReports',
  'dayPlans',
  'recurringPlans',
  'deletedServiceReports',
  'deletedDayPlans',
  'deletedRecurringPlans',
  'categories',
  'deletedCategories',
  'preferencesValues',
  'preferenceUpdatedAt',
  'profileValues',
  'profileUpdatedAt',
] as const

describe('mergePayload — changed', () => {
  it('is false for older copies of records deleted here, and leaves local untouched', () => {
    const local = localState()

    const result = mergePayload(local, frozenPeer())

    expect(result.changed).toBe(false)
    for (const key of collections) expect(result[key]).toEqual(local[key])
  })

  it('stays false on every later pull', () => {
    let local = localState()
    for (let pull = 0; pull < 3; pull++) {
      const result = mergePayload(local, frozenPeer())
      expect(result.changed).toBe(false)
      local = result
    }
  })

  it('is false for a peer in step, and leaves local untouched', () => {
    const local = localState()

    const result = mergePayload(local, peerInStep())

    expect(result.changed).toBe(false)
    for (const key of collections) expect(result[key]).toEqual(local[key])
  })

  it('is true when a remote record is newer, replacing only that collection', () => {
    const local = localState()
    const peer = peerInStep()
    peer.conversationStore.conversations = [visit('v1', NOW)]

    const result = mergePayload(local, peer)

    expect(result.changed).toBe(true)
    expect(result.conversations[0].updatedAt).toBe(NOW)
    expect(result.contacts).toEqual(local.contacts)
    expect(result.dayPlans).toEqual(local.dayPlans)
  })

  it.each([
    ['deletedConversations', 'conversationStore'],
    ['deletedServiceReports', 'serviceReportStore'],
    ['deletedDayPlans', 'serviceReportStore'],
    ['deletedRecurringPlans', 'serviceReportStore'],
    ['deletedCategories', 'categoryStore'],
    ['deletedCustomFieldDefs', 'contactStore'],
  ] as const)('is true when a %s tombstone arrives', (key, slice) => {
    const local = localState()
    const peer = peerInStep()
    const slice_ = peer[slice] as Record<string, unknown>
    slice_[key] = [
      ...(slice_[key] as unknown[]),
      { id: 'arriving', deletedAt: DELETED_AT },
    ]

    const result = mergePayload(local, peer)

    expect(result[key]).toContainEqual({
      id: 'arriving',
      deletedAt: DELETED_AT,
    })
    expect(result.changed).toBe(true)
  })

  it('is true when a time entry moves to a newer copy', () => {
    const local = localState()
    const peer = peerInStep()
    peer.serviceReportStore.serviceReports = {
      2026: { 8: [{ ...entry('e1', NOW), hours: 2 }] },
    }

    const result = mergePayload(local, peer)

    expect(result.changed).toBe(true)
    expect(result.serviceReports[2026][8]).toEqual([
      { ...entry('e1', NOW), hours: 2 },
    ])
  })

  it('is true when a deleted custom field is stripped from a contact', () => {
    const local = {
      ...localState(),
      contacts: [contact('c1', OLD, { customFields: { 'f-gone': 'x' } })],
    }

    const result = mergePayload(local, peerInStep())

    expect(result.changed).toBe(true)
    expect(result.contacts[0].customFields?.['f-gone']).toBeUndefined()
  })

  it('is true when a repeated local record collapses into one', () => {
    const local = {
      ...localState(),
      conversations: [visit('v1', OLD), visit('v1', OLD)],
    }

    const result = mergePayload(local, peerInStep())

    expect(result.changed).toBe(true)
    expect(result.conversations).toHaveLength(1)
  })
})
