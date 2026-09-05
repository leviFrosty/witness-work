import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
import useMileage, { initialMileageState } from '@/stores/mileage'
import { MileageEntry, MileageVehicle } from '@/types/mileage'

const vehicle: MileageVehicle = {
  id: 'v',
  name: 'Car',
  avatar: { type: 'emoji', value: '🚗' },
  avatarBackground: '#fff',
  createdAt: 1,
  updatedAt: 1,
}
const entry: MileageEntry = {
  id: 'e',
  date: '2026-08-31',
  vehicleId: 'v',
  categoryId: 'c',
  mode: 'distance',
  status: 'completed',
  distanceMeters: 1234.56789,
  note: 'Original note',
  createdAt: 1,
  updatedAt: 1,
}

describe('mileage store', () => {
  beforeEach(() => {
    useMileage.setState(initialMileageState)
    useMileage.getState().addVehicle(vehicle)
    useMileage
      .getState()
      .addCategory({ id: 'c', name: 'Travel', createdAt: 1, updatedAt: 1 })
  })
  it('edits individual fields while preserving metadata, references and precision', () => {
    useMileage.getState().addEntry(entry)
    const original = useMileage.getState().entries[0]
    useMileage
      .getState()
      .updateEntry({ id: 'e', note: 'Edited note', createdAt: 0 })
    expect(useMileage.getState().entries[0]).toMatchObject({
      ...original,
      note: 'Edited note',
      createdAt: original.createdAt,
    })
    useMileage.getState().updateVehicle({ id: 'v', name: 'Renamed' })
    useMileage.getState().updateCategory({ id: 'c', name: 'New label' })
    expect(useMileage.getState().entries[0].distanceMeters).toBe(
      entry.distanceMeters
    )
    expect(useMileage.getState().entries[0].vehicleId).toBe('v')
  })
  it('rejects invalid updates atomically', () => {
    useMileage.getState().addEntry(entry)
    const before = useMileage.getState().entries
    expect(() =>
      useMileage.getState().updateEntry({ id: 'e', distanceMeters: -1 })
    ).toThrow()
    expect(useMileage.getState().entries).toBe(before)
    expect(() =>
      useMileage.getState().updateVehicle({ id: 'v', combinedMpg: 0 })
    ).toThrow()
    expect(useMileage.getState().vehicles[0].combinedMpg).toBeUndefined()
  })
  it('archives referenced vehicles and categories, restores them, and tombstones unused records', () => {
    useMileage.getState().addEntry(entry)
    useMileage.getState().deleteVehicle('v')
    useMileage.getState().deleteCategory('c')
    expect(useMileage.getState().vehicles[0].archivedAt).toBeTypeOf('number')
    expect(useMileage.getState().categories[0].archivedAt).toBeTypeOf('number')
    expect(useMileage.getState().deletedVehicles).toEqual([])
    expect(useMileage.getState().deletedCategories).toEqual([])
    useMileage
      .getState()
      .updateEntry({ id: 'e', note: 'Archived history still editable' })
    useMileage.getState().restoreVehicle('v')
    useMileage.getState().restoreCategory('c')
    expect(useMileage.getState().vehicles[0].archivedAt).toBeUndefined()
    expect(useMileage.getState().categories[0].archivedAt).toBeUndefined()
    useMileage.getState().deleteEntry('e')
    useMileage.getState().deleteEntry('e')
    useMileage.getState().deleteVehicle('v')
    useMileage.getState().deleteCategory('c')
    expect(useMileage.getState().entries).toEqual([])
    expect(useMileage.getState().vehicles).toEqual([])
    expect(useMileage.getState().categories).toEqual([])
    for (const tombstones of [
      useMileage.getState().deletedEntries,
      useMileage.getState().deletedVehicles,
      useMileage.getState().deletedCategories,
    ])
      expect(tombstones).toHaveLength(1)
  })
  it('persists and rehydrates pending trips and finishes without moving the incurred date', async () => {
    let persisted: string | null = null
    useMileage.persist.setOptions({
      storage: createJSONStorage(() => ({
        getItem: () => persisted,
        setItem: (_, value) => {
          persisted = value
        },
        removeItem: () => {
          persisted = null
        },
      })),
    })
    useMileage.getState().addEntry({
      ...entry,
      mode: 'odometer',
      status: 'inProgress',
      startOdometerMeters: 123456.789,
    })
    const snapshot = persisted
    useMileage.setState(initialMileageState)
    persisted = snapshot
    await useMileage.persist.rehydrate()
    expect(useMileage.getState().entries[0]).toMatchObject({
      date: '2026-08-31',
      status: 'inProgress',
      startOdometerMeters: 123456.789,
    })
    expect(useMileage.getState().entries[0].distanceMeters).toBeUndefined()
    useMileage.getState().updateEntry({
      id: 'e',
      status: 'completed',
      endOdometerMeters: 123556.789,
    })
    expect(useMileage.getState().entries[0]).toMatchObject({
      date: '2026-08-31',
      status: 'completed',
      distanceMeters: 100,
      note: 'Original note',
      vehicleId: 'v',
      categoryId: 'c',
    })
    useMileage.getState().deleteEntry('e')
    expect(JSON.parse(persisted!).state.deletedEntries).toHaveLength(1)
  })
})
