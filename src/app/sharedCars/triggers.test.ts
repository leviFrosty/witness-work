import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import { emptySharedCar } from '@/lib/mileage/sharedCar'
import { createSharedCarsMemoryStore } from '@/stores/sharedCars'
import { watchLocalChanges } from '@/app/sharedCars/triggers'
import type { Trip } from '@/types/mileage'

const trip = (id: string): Trip => ({
  id,
  vehicleId: 'car-1',
  date: '2026-02-03',
  distanceMiles: 3,
  createdAt: 1,
})

describe('watchLocalChanges', () => {
  let store: ReturnType<typeof createSharedCarsMemoryStore>
  let engineWriting = false
  const synced: string[] = []
  let stop = () => {}

  beforeEach(() => {
    vi.useFakeTimers()
    synced.length = 0
    engineWriting = false
    store = createSharedCarsMemoryStore()
    store.getState().saveSharedCar(emptySharedCar('a', { myMemberId: 'me' }))
    store.getState().saveSharedCar(emptySharedCar('b', { myMemberId: 'me' }))
    stop = watchLocalChanges(store, (spaceId) => synced.push(spaceId), {
      isEngineWrite: () => engineWriting,
    })
  })

  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('syncs a car once, 2 s after the last of a burst of changes', () => {
    store.getState().saveTrip('a', trip('t1'))
    vi.advanceTimersByTime(1500)
    store.getState().saveTrip('a', trip('t2'))
    vi.advanceTimersByTime(1500)
    expect(synced).toEqual([])
    vi.advanceTimersByTime(500)
    expect(synced).toEqual(['a'])
    vi.advanceTimersByTime(10_000)
    expect(synced).toEqual(['a'])
  })

  it('times each car on its own', () => {
    store.getState().saveTrip('a', trip('t1'))
    vi.advanceTimersByTime(1000)
    store.getState().saveTrip('b', trip('t2'))
    vi.advanceTimersByTime(1000)
    expect(synced).toEqual(['a'])
    vi.advanceTimersByTime(1000)
    expect(synced).toEqual(['a', 'b'])
  })

  it('ignores what the engine writes as it syncs', () => {
    engineWriting = true
    store.getState().saveTrip('a', trip('t1'))
    engineWriting = false
    vi.advanceTimersByTime(5000)
    expect(synced).toEqual([])
  })

  it('ignores changes that leave nothing to put', () => {
    store
      .getState()
      .updateSharedCar('a', (car) => ({ ...car, lastSyncedAt: 5 }))
    vi.advanceTimersByTime(5000)
    expect(synced).toEqual([])
  })

  it('drops changes still waiting when stopped', () => {
    store.getState().saveTrip('a', trip('t1'))
    stop()
    vi.advanceTimersByTime(5000)
    expect(synced).toEqual([])
  })
})
