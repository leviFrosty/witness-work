import { describe, expect, it } from 'vitest'
import { mergePayload } from '@/app/sync/merge'
import { SyncPayload } from '@/app/sync/payload'
import { Category, CategoryTombstone } from '@/types/category'
import type { MileageSnapshot } from '@/types/mileage'
import type { PetSnapshot } from '@/types/pet'

type LocalState = {
  contacts: any[]

  deletedContacts: any[]

  customFieldDefs: any[]

  deletedCustomFieldDefs: any[]

  conversations: any[]

  deletedConversations: any[]

  serviceReports: Record<string, Record<string, any[]>>

  dayPlans: any[]

  recurringPlans: any[]

  deletedServiceReports: any[]
  categories: Category[]
  deletedCategories: CategoryTombstone[]
  vehicles: MileageSnapshot['vehicles']
  fuels: MileageSnapshot['fuels']
  fuelPrices: MileageSnapshot['fuelPrices']
  vehicleSetups: MileageSnapshot['vehicleSetups']
  trips: MileageSnapshot['trips']
  deletedMileageRecords: MileageSnapshot['deletedMileageRecords']
  pets: PetSnapshot['pets']
  petRooms: PetSnapshot['petRooms']
  deletedPetRecords: PetSnapshot['deletedPetRecords']
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
  vehicles: [],
  fuels: [],
  fuelPrices: [],
  vehicleSetups: [],
  trips: [],
  deletedMileageRecords: [],
  pets: [],
  petRooms: [],
  deletedPetRecords: [],
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

  it('keeps per-month stamps when it takes a history this device lacked', () => {
    const phone = emptyLocal()
    phone.preferencesValues = { role: 'publisher', roleHistory: null }
    const ipad = {
      values: {
        role: 'specialPioneer',
        roleHistory: {
          initial: 'publisher',
          changes: { '2026-03': 'regularPioneer', '2026-09': 'specialPioneer' },
        },
      },
      updatedAt: {
        role: 100,
        roleHistory: 100,
        'roleHistory:initial': 100,
        'roleHistory:2026-03': 100,
        'roleHistory:2026-09': 100,
      },
    }
    const first = mergePayload(phone, makeRemote({ preferencesStore: ipad }))
    expect(first.preferenceUpdatedAt).toMatchObject(ipad.updatedAt)

    const ipadLater = makeRemote({
      preferencesStore: {
        values: {
          role: 'specialPioneer',
          roleHistory: {
            initial: 'publisher',
            changes: { '2026-09': 'specialPioneer' },
          },
        },
        updatedAt: {
          ...ipad.updatedAt,
          roleHistory: 200,
          'roleHistory:2026-03': 200,
        },
      },
    })
    const phoneLater = {
      ...emptyLocal(),
      preferencesValues: {
        role: 'circuitOverseer',
        roleHistory: {
          initial: 'publisher',
          changes: {
            '2026-03': 'regularPioneer',
            '2026-09': 'circuitOverseer',
          },
        },
      },
      preferenceUpdatedAt: {
        ...first.preferenceUpdatedAt,
        role: 300,
        roleHistory: 300,
        'roleHistory:2026-09': 300,
      },
    }

    const merged = mergePayload(phoneLater, ipadLater)
    expect(merged.preferencesValues.roleHistory).toEqual({
      initial: 'publisher',
      changes: { '2026-09': 'circuitOverseer' },
    })
    expect(merged.preferencesValues.role).toBe('circuitOverseer')
  })
})
