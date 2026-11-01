import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useServiceReport from '@/stores/serviceReport'
import useConversations from '@/stores/conversationStore'
import useCategories from '@/stores/categories'
import useMileage from '@/stores/mileage'
import {
  deviceFromStores,
  pullFrom,
  timeEntriesOf,
} from '@/__tests__/helpers/syncPeer'

const NOW = new Date(2026, 9, 21, 9).getTime()
const deletedAt = NOW + 4 * 60_000

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useServiceReport.getState()._WARNING_forceDeleteServiceReports()
  useConversations.getState()._WARNING_forceDeleteConversations()
  useCategories.getState()._WARNING_forceDeleteCategories()
  useMileage.getState()._WARNING_forceDeleteMileage()
})

afterEach(() => {
  vi.useRealTimers()
})

const readdAndSync = (seedTombstone: () => void, readd: () => void) => {
  seedTombstone()
  const peer = deviceFromStores()
  readd()
  const local = deviceFromStores()
  return { local, merged: [pullFrom(local, peer), pullFrom(peer, local)] }
}

const ids = (records: { id: string }[]) => records.map((record) => record.id)

describe('re-adding a record over a tombstone stamped ahead', () => {
  it('keeps a Time Entry', () => {
    const { local, merged } = readdAndSync(
      () =>
        useServiceReport.getState().set({
          deletedServiceReports: [
            { id: 'entry', deletedAt, importUndone: true },
          ],
        }),
      () =>
        useServiceReport.getState().addServiceReports([
          {
            id: 'entry',
            hours: 1,
            minutes: 0,
            date: new Date(2026, 9, 20, 12),
          },
        ])
    )

    for (const device of merged)
      expect(ids(timeEntriesOf(device))).toEqual(['entry'])
    expect(local.deletedServiceReports).toEqual([])
  })

  it('keeps a Visit', () => {
    const { local, merged } = readdAndSync(
      () =>
        useConversations.setState({
          deletedConversations: [
            { id: 'visit', deletedAt, importUndone: true },
          ],
        }),
      () =>
        useConversations.getState().addConversations([
          {
            id: 'visit',
            contact: { id: 'contact' },
            date: new Date(2026, 9, 20, 12),
            isBibleStudy: false,
          },
        ])
    )

    for (const device of merged)
      expect(ids(device.conversations)).toEqual(['visit'])
    expect(local.deletedConversations).toEqual([])
  })

  it('keeps a Category', () => {
    const { local, merged } = readdAndSync(
      () =>
        useCategories.getState().set({
          deletedCategories: [{ id: 'category', deletedAt }],
        }),
      () =>
        useCategories
          .getState()
          .addCategory({ id: 'category', name: 'Cart', isCredit: false })
    )

    for (const device of merged)
      expect(ids(device.categories)).toEqual(['category'])
    expect(local.deletedCategories).toEqual([])
  })

  it('keeps a mileage record', () => {
    const { local, merged } = readdAndSync(
      () =>
        useMileage.setState({
          deletedMileageRecords: [{ id: 'trip', deletedAt }],
        }),
      () =>
        useMileage.getState().saveTrip({
          id: 'trip',
          vehicleId: 'car',
          date: '2026-10-20',
          distanceMiles: 12,
          createdAt: NOW,
        })
    )

    for (const device of merged) expect(ids(device.trips)).toEqual(['trip'])
    expect(local.deletedMileageRecords).toEqual([])
  })
})
