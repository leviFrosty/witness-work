import moment from 'moment'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useServiceReport from '@/stores/serviceReport'
import { applyRollover } from '@/features/service-reports/lib/rollover'
import { addRolloverEntries } from '@/features/service-reports/lib/addRolloverEntries'
import { momentStoredDate } from '@/lib/normalizeDate'
import {
  deviceFromStores,
  pullFrom,
  timeEntriesOf,
  type DeviceState,
} from '@/__tests__/helpers/syncPeer'
import type { TimeEntry } from '@/types/timeEntry'

const LAUNCH = new Date(2026, 9, 1, 9).getTime()
const TODAY = moment(LAUNCH)

const minutesLater = (minutes: number) =>
  vi.setSystemTime(LAUNCH + minutes * 60_000)

/** Applies the pending rollover the way `useRollover().apply` does. */
const applyNow = () => {
  const result = applyRollover({
    serviceReports: useServiceReport.getState().serviceReports,
    today: TODAY,
    hasAnnualGoal: true,
    lastRolloverYearMonth: null,
  })
  if (result) addRolloverEntries(result.entries)
  return result
}

const rolloverIdsOf = (device: DeviceState) =>
  timeEntriesOf(device)
    .filter((entry) => entry.rollover)
    .map((entry) => entry.id)
    .sort()

const septemberMinutes = (device: DeviceState) =>
  timeEntriesOf(device)
    .filter((entry) => momentStoredDate(entry.date).month() === 8)
    .reduce((sum, entry) => sum + entry.hours * 60 + entry.minutes, 0)

const allIds = () =>
  timeEntriesOf(deviceFromStores())
    .map((entry) => entry.id)
    .sort()

const restore = (device: DeviceState) =>
  useServiceReport.getState().set({
    serviceReports: structuredClone(device.serviceReports),
    deletedServiceReports: structuredClone(device.deletedServiceReports),
  })

const september = (id: string, minutes: number): TimeEntry => ({
  id,
  hours: 0,
  minutes,
  date: new Date(2026, 8, 15, 12),
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(LAUNCH)
  useServiceReport.getState()._WARNING_forceDeleteServiceReports()
  // 10h 30m in September: 30 minutes to roll into October.
  useServiceReport.getState().addServiceReport(september('sep-1', 630))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rollover across devices', () => {
  it('two devices rolling the same month over keep one pair after sync', () => {
    const beforeRollover = deviceFromStores()
    applyNow()
    const phone = deviceFromStores()

    // The tablet opens on the same day with the same data, before syncing.
    restore(beforeRollover)
    minutesLater(1)
    applyNow()
    const tablet = deviceFromStores()

    expect(rolloverIdsOf(tablet)).toEqual(rolloverIdsOf(phone))
    for (const merged of [pullFrom(phone, tablet), pullFrom(tablet, phone)]) {
      expect(rolloverIdsOf(merged)).toEqual([
        'rollover-2026-09-to-2026-10-dst',
        'rollover-2026-09-to-2026-10-src',
      ])
      // Floored once, to 10 hours.
      expect(septemberMinutes(merged)).toBe(600)
    }
  })

  it('never stores two live entries under one id', () => {
    applyNow()
    // A backdated September entry makes the month fractional again.
    useServiceReport.getState().addServiceReport(september('sep-2', 20))
    applyNow()

    const ids = allIds()
    expect(new Set(ids).size).toBe(ids.length)
    expect(rolloverIdsOf(deviceFromStores())).toEqual([
      'rollover-2026-09-to-2026-10-2-dst',
      'rollover-2026-09-to-2026-10-2-src',
      'rollover-2026-09-to-2026-10-dst',
      'rollover-2026-09-to-2026-10-src',
    ])
    expect(septemberMinutes(deviceFromStores())).toBe(600)
  })

  it('reuses the ids after Undo, and the re-applied pair beats the tombstone', () => {
    applyNow()
    const [rolled] = timeEntriesOf(deviceFromStores()).filter((e) => e.rollover)

    minutesLater(1)
    useServiceReport.getState().deleteRolloverPair(rolled)
    const peerAfterUndo = deviceFromStores()
    expect(rolloverIdsOf(peerAfterUndo)).toEqual([])

    minutesLater(2)
    applyNow()
    const local = deviceFromStores()
    expect(rolloverIdsOf(local)).toEqual([
      'rollover-2026-09-to-2026-10-dst',
      'rollover-2026-09-to-2026-10-src',
    ])

    for (const merged of [
      pullFrom(peerAfterUndo, local),
      pullFrom(local, peerAfterUndo),
    ]) {
      expect(rolloverIdsOf(merged)).toEqual(rolloverIdsOf(local))
      expect(septemberMinutes(merged)).toBe(600)
    }
  })

  it('re-applies after an Undo from a device whose clock runs ahead', () => {
    applyNow()
    const beforeUndo = deviceFromStores()
    const [rolled] = timeEntriesOf(beforeUndo).filter((e) => e.rollover)

    // The tablet, three minutes ahead, undoes the pair; this device pulls it.
    const tabletAhead = 3 * 60_000
    vi.setSystemTime(LAUNCH + tabletAhead)
    useServiceReport.getState().deleteRolloverPair(rolled)
    const tablet = deviceFromStores()
    vi.setSystemTime(LAUNCH + 30_000)
    restore(pullFrom(beforeUndo, tablet))
    expect(rolloverIdsOf(deviceFromStores())).toEqual([])

    // Re-applied here a minute later by this device's clock, which is still
    // earlier than the tablet's tombstones.
    minutesLater(1)
    applyNow()
    const local = deviceFromStores()
    const tombstoneAt = Math.max(
      ...local.deletedServiceReports.map((t) => t.deletedAt)
    )
    expect(tombstoneAt).toBeGreaterThan(Date.now())
    for (const entry of timeEntriesOf(local).filter((e) => e.rollover)) {
      expect(entry.updatedAt).toBeGreaterThan(tombstoneAt)
    }

    const onPhone = pullFrom(local, tablet)
    vi.setSystemTime(Date.now() + tabletAhead)
    const onTablet = pullFrom(tablet, local)
    for (const merged of [onPhone, onTablet]) {
      expect(rolloverIdsOf(merged)).toEqual([
        'rollover-2026-09-to-2026-10-dst',
        'rollover-2026-09-to-2026-10-src',
      ])
      expect(septemberMinutes(merged)).toBe(600)
    }
  })
})
