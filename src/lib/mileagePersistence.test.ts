import { describe, expect, it } from 'vitest'
import {
  emptyMileageData,
  mileageForRestore,
  mileageSnapshot,
  parseMileageData,
} from '@/lib/mileagePersistence'

const history = () => ({
  ...emptyMileageData(),
  vehicles: [
    {
      id: 'car',
      name: 'Corolla',
      combinedMpg: 32.5,
      avatar: { type: 'emoji' as const, value: '🚗' },
      avatarBackground: '#112233',
      archivedAt: 3,
      createdAt: 1,
      updatedAt: 3,
    },
  ],
  categories: [
    {
      id: 'category',
      name: 'Congregation',
      archivedAt: 3,
      createdAt: 1,
      updatedAt: 3,
    },
  ],
  entries: [
    {
      id: 'trip',
      date: '2026-09-04',
      vehicleId: 'car',
      categoryId: 'category',
      mode: 'odometer' as const,
      status: 'inProgress' as const,
      startOdometerMeters: 160934.4,
      createdAt: 2,
      updatedAt: 2,
    },
  ],
  deletedEntries: [{ id: 'old-trip', deletedAt: 2 }],
})

describe('mileage backup and wire data', () => {
  it('round-trips pending history, archived references, emoji/color and deletion history', () => {
    const data = history()
    const json = JSON.stringify(
      mileageSnapshot({ ...data, extraMethod: () => {} } as typeof data)
    )
    expect(json).not.toContain('extraMethod')
    expect(mileageForRestore(JSON.parse(json), emptyMileageData())).toEqual(
      data
    )
  })

  it('preserves mileage when an older backup omits the slice but honors explicit empty restoration', () => {
    expect(mileageForRestore(undefined, history())).toEqual(history())
    expect(mileageForRestore(emptyMileageData(), history())).toEqual(
      emptyMileageData()
    )
  })

  it('rejects malformed data before any restoration can use it', () => {
    const data = history()
    expect(() => mileageForRestore({ ...data, vehicles: [] }, data)).toThrow(
      'Invalid mileage backup'
    )
    expect(
      parseMileageData({
        ...data,
        entries: [{ ...data.entries[0], date: '2026-02-30' }],
      })
    ).toBeNull()
    expect(
      parseMileageData({
        ...data,
        vehicles: [{ ...data.vehicles[0], combinedMpg: -1 }],
      })
    ).toBeNull()
    expect(
      parseMileageData({ ...data, entries: [data.entries[0], data.entries[0]] })
    ).toBeNull()
    expect(data).toEqual(history())
  })

  it('rejects a completed odometer total that differs from its readings', () => {
    const data = history()
    const trip = {
      ...data.entries[0],
      status: 'completed',
      endOdometerMeters: 162934.4,
      distanceMeters: 5000,
    }
    expect(parseMileageData({ ...data, entries: [trip] })).toBeNull()
    expect(
      parseMileageData({
        ...data,
        entries: [{ ...trip, distanceMeters: 2000 }],
      })
    ).not.toBeNull()
  })
})
