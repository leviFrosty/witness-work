import { describe, expect, it } from 'vitest'
import { mergeMileageData, mergePayload } from '@/app/sync/merge'
import { emptyMileageData, parseMileageData } from '@/lib/mileagePersistence'
import { MileageData, MileageEntry, MileageVehicle } from '@/types/mileage'
import { SyncPayload } from '@/app/sync/payload'

const now = Date.now()
const vehicle: MileageVehicle = {
  id: 'car',
  name: 'Corolla',
  avatar: { type: 'emoji', value: '🚗' },
  avatarBackground: '',
  createdAt: now - 1000,
  updatedAt: now - 1000,
}
const entry: MileageEntry = {
  id: 'trip',
  vehicleId: 'car',
  categoryId: 'ministry',
  date: '2026-09-01',
  mode: 'distance',
  status: 'completed',
  distanceMeters: 1609.344,
  createdAt: now - 500,
  updatedAt: now - 500,
}
const data = (): MileageData => ({
  ...emptyMileageData(),
  vehicles: [vehicle],
  entries: [entry],
  categories: [
    {
      id: 'ministry',
      name: 'Ministry',
      createdAt: now - 1000,
      updatedAt: now - 1000,
    },
  ],
})

describe('mileage sync merge', () => {
  it('retains mileage when an older client has no mileage slice', () => {
    const local = data()
    const result = mergeMileageData(local, undefined, now)
    expect(result.data).toEqual(local)
    expect(result.changed).toBe(false)
  })

  it('syncs an archived Vehicle and a finished trip without changing history identity', () => {
    const local = data()
    local.entries = [
      {
        ...entry,
        mode: 'odometer',
        status: 'inProgress',
        distanceMeters: undefined,
        startOdometerMeters: 10000,
      },
    ]
    const remote = data()
    remote.vehicles = [{ ...vehicle, archivedAt: now, updatedAt: now }]
    remote.entries = [
      {
        ...entry,
        mode: 'odometer',
        startOdometerMeters: 10000,
        endOdometerMeters: 11000,
        distanceMeters: 1000,
        updatedAt: now,
      },
    ]
    const result = mergeMileageData(local, remote, now)
    expect(result.data.vehicles[0].archivedAt).toBe(now)
    expect(result.data.entries[0]).toMatchObject({
      id: 'trip',
      status: 'completed',
      distanceMeters: 1000,
    })
    expect(parseMileageData(result.data)).not.toBeNull()
    expect(result.changed).toBe(true)
  })

  it('applies entry deletion and detects a newer tombstone with the same array length', () => {
    const local = data()
    local.deletedEntries = [{ id: 'trip', deletedAt: now - 900 }]
    const remote = emptyMileageData()
    remote.deletedEntries = [{ id: 'trip', deletedAt: now }]
    const result = mergeMileageData(local, remote, now)
    expect(result.data.entries).toEqual([])
    expect(result.data.deletedEntries).toEqual([{ id: 'trip', deletedAt: now }])
    expect(result.changed).toBe(true)
  })

  it('keeps a concurrent entry readable when its Vehicle and category were deleted on a peer', () => {
    const remote = emptyMileageData()
    remote.deletedVehicles = [{ id: 'car', deletedAt: now }]
    remote.deletedCategories = [{ id: 'ministry', deletedAt: now }]
    const result = mergeMileageData(data(), remote, now)
    expect(result.data.entries).toHaveLength(1)
    expect(result.data.vehicles[0]).toMatchObject({
      id: 'car',
      archivedAt: now,
      updatedAt: now + 1,
    })
    expect(result.data.categories[0]).toMatchObject({
      id: 'ministry',
      archivedAt: now,
      updatedAt: now + 1,
    })
    expect(parseMileageData(result.data)).not.toBeNull()
    expect(mergeMileageData(result.data, remote, now).changed).toBe(false)
  })

  it('deletes unused Vehicles and retains restored records newer than deletion', () => {
    const local = data()
    local.entries = []
    const remote = emptyMileageData()
    remote.deletedVehicles = [
      { id: 'car', deletedAt: now },
      { id: 'ancient', deletedAt: now - 91 * 86400000 },
    ]
    expect(mergeMileageData(local, remote, now).data.vehicles).toEqual([])
    local.vehicles = [{ ...vehicle, updatedAt: now + 1 }]
    const result = mergeMileageData(local, remote, now)
    expect(result.data.vehicles).toEqual(local.vehicles)
    expect(result.data.deletedVehicles).toHaveLength(2)
  })

  it('does not resurrect deleted trips from a peer that has been offline beyond 90 days', () => {
    const local = emptyMileageData()
    const deletedAt = now - 91 * 86400000
    local.deletedEntries = [{ id: entry.id, deletedAt }]
    local.deletedVehicles = [{ id: vehicle.id, deletedAt }]
    local.deletedCategories = [{ id: 'ministry', deletedAt }]
    const remote = data()
    remote.entries[0] = { ...entry, updatedAt: deletedAt - 1 }
    remote.vehicles[0] = { ...vehicle, updatedAt: deletedAt - 1 }
    remote.categories[0] = { ...remote.categories[0], updatedAt: deletedAt - 1 }
    const result = mergeMileageData(local, remote, now)
    expect(result.data.entries).toEqual([])
    expect(result.data.vehicles).toEqual([])
    expect(result.data.categories).toEqual([])
    expect(result.data.deletedEntries).toEqual(local.deletedEntries)
  })

  it('preserves two independently started trips for resolution instead of dropping one', () => {
    const local = data()
    const remote = data()
    local.entries = [
      {
        ...entry,
        mode: 'odometer',
        status: 'inProgress',
        startOdometerMeters: 10000,
        distanceMeters: undefined,
      },
    ]
    remote.entries = [{ ...local.entries[0], id: 'other-trip' }]
    const result = mergeMileageData(local, remote, now)
    expect(result.data.entries).toHaveLength(2)
    expect(parseMileageData(result.data)).not.toBeNull()
  })

  it('propagates mileage-only changes through the full payload merge result', () => {
    const local: Parameters<typeof mergePayload>[0] = {
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
    }
    const remote: SyncPayload = {
      version: 1,
      deviceId: 'peer',
      writtenAt: now,
      contactStore: { contacts: [], deletedContacts: [] },
      conversationStore: { conversations: [] },
      serviceReportStore: {
        serviceReports: {},
        dayPlans: [],
        recurringPlans: [],
      },
      preferencesStore: { values: {}, updatedAt: {} },
      mileageStore: data(),
    }
    const result = mergePayload(local, remote)
    expect(result.changed).toBe(true)
    expect(result.mileage).toEqual(data())
    expect(result.serviceReports).toEqual({})
    expect(result.preferencesValues).toEqual({})
  })
})
