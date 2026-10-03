import { describe, expect, it } from 'vitest'
import { mergePayload } from '@/app/sync/merge'
import { foldRemotePayloads } from '@/app/sync/foldRemotePayloads'
import { payloadSchema } from '@/app/sync/payloadValidation'
import type { SyncPayload } from '@/app/sync/payload'
import type { Trip, Vehicle } from '@/types/mileage'

const emptyLocal = (): Parameters<typeof mergePayload>[0] => ({
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
  preferencesValues: {},
  preferenceUpdatedAt: {},
  profileValues: {},
  profileUpdatedAt: {},
})

const remote = (mileage?: SyncPayload['mileageStore']): SyncPayload => ({
  version: 1,
  writtenAt: 1_000,
  deviceId: 'peer',
  contactStore: { contacts: [], deletedContacts: [] },
  conversationStore: { conversations: [] },
  serviceReportStore: { serviceReports: {}, dayPlans: [], recurringPlans: [] },
  ...(mileage ? { mileageStore: mileage } : {}),
  preferencesStore: { values: {}, updatedAt: {} },
})

const emptyMileage = () => ({
  vehicles: [] as Vehicle[],
  fuels: [],
  fuelPrices: [],
  vehicleSetups: [],
  trips: [] as Trip[],
  deletedMileageRecords: [] as { id: string; deletedAt: number }[],
})

const car: Vehicle = { id: 'car', name: 'Civic', createdAt: 1, updatedAt: 100 }
const trip: Trip = {
  id: 'trip',
  vehicleId: 'car',
  date: '2026-03-10',
  distanceMiles: 12,
  createdAt: 1,
  updatedAt: 100,
}

describe('mileage sync merge', () => {
  it('keeps local mileage when the peer predates the feature', () => {
    const local = { ...emptyLocal(), vehicles: [car], trips: [trip] }
    const result = mergePayload(local, remote())
    expect(result.vehicles).toEqual([car])
    expect(result.trips).toEqual([trip])
    expect(result.changed).toBe(false)
  })

  it('inserts remote records and keeps the newer edit', () => {
    const local = { ...emptyLocal(), trips: [trip] }
    const edited = { ...trip, distanceMiles: 20, updatedAt: 200 }
    const result = mergePayload(
      local,
      remote({ ...emptyMileage(), vehicles: [car], trips: [edited] })
    )
    expect(result.vehicles).toEqual([car])
    expect(result.trips).toEqual([edited])
    expect(result.changed).toBe(true)
  })

  it('applies tombstones from either side to every collection', () => {
    const local = { ...emptyLocal(), vehicles: [car], trips: [trip] }
    const result = mergePayload(
      local,
      remote({
        ...emptyMileage(),
        deletedMileageRecords: [
          { id: 'car', deletedAt: 150 },
          { id: 'trip', deletedAt: 150 },
        ],
      })
    )
    expect(result.vehicles).toEqual([])
    expect(result.trips).toEqual([])
    expect(result.deletedMileageRecords).toHaveLength(2)
  })

  it('keeps a record edited after its deletion', () => {
    const local = {
      ...emptyLocal(),
      trips: [{ ...trip, updatedAt: 300 }],
    }
    const result = mergePayload(
      local,
      remote({
        ...emptyMileage(),
        deletedMileageRecords: [{ id: 'trip', deletedAt: 150 }],
      })
    )
    expect(result.trips).toHaveLength(1)
  })

  it('carries mileage through a folded restore', () => {
    const folded = foldRemotePayloads([
      remote({ ...emptyMileage(), vehicles: [car], trips: [trip] }),
    ])
    expect(folded?.mileageStore?.trips).toEqual([trip])
    expect(folded?.mileageStore?.vehicles).toEqual([car])
  })

  it('excludes mileage from before a reset regardless of file order', () => {
    const stale = remote({ ...emptyMileage(), vehicles: [car], trips: [trip] })
    const epoch = { id: 'reset', at: 2_000, deviceId: 'new-device' }
    const reset = { ...remote(), resetEpoch: epoch }
    const currentTrip = { ...trip, id: 'current-trip', distanceMiles: 5 }
    const current = {
      ...remote({ ...emptyMileage(), trips: [currentTrip] }),
      resetEpoch: epoch,
    }

    for (const files of [
      [stale, reset, current],
      [current, reset, stale],
    ]) {
      const folded = foldRemotePayloads(files)
      expect(folded?.resetEpoch).toEqual(epoch)
      expect(folded?.mileageStore?.vehicles).toEqual([])
      expect(folded?.mileageStore?.trips).toEqual([currentTrip])
    }
  })

  it('validates the wire shape and rejects malformed dates', () => {
    const valid = remote({ ...emptyMileage(), vehicles: [car], trips: [trip] })
    expect(payloadSchema.safeParse(valid).success).toBe(true)
    expect(payloadSchema.safeParse(remote()).success).toBe(true)
    const bad = remote({
      ...emptyMileage(),
      trips: [{ ...trip, date: 'March 10' }],
    })
    expect(payloadSchema.safeParse(bad).success).toBe(false)
  })
})
