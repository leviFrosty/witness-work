import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import {
  normalizeTimeEntriesCredit,
  restampTimeEntriesCredit,
} from '@/lib/categories'
import { getTotalMinutesDetailedForSpecificMonth } from '@/lib/serviceReport'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  emptyDevice,
  pullFrom,
  timeEntriesOf,
  type DeviceState,
} from '@/__tests__/helpers/syncPeer'
import type { Category } from '@/types/category'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'

const NOW = 1_790_000_000_000

const entry = (
  id: string,
  categoryId: string | undefined,
  credit: boolean | undefined,
  updatedAt = 1
): TimeEntry => ({
  id,
  hours: 2,
  minutes: 0,
  date: normalizeDateForStorage(new Date(2026, 8, 10)),
  ...(categoryId ? { categoryId } : {}),
  ...(credit !== undefined ? { credit } : {}),
  updatedAt,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

const creditMinutes = (device: DeviceState) =>
  getTotalMinutesDetailedForSpecificMonth(timeEntriesOf(device), 8, 2026).credit

/** What `useTimeEntryCreditNormalization` does on each device after a pull. */
const normalized = (device: DeviceState): DeviceState => ({
  ...device,
  serviceReports: normalizeTimeEntriesCredit(
    device.serviceReports,
    device.categories
  ).serviceReports,
})

describe('restampTimeEntriesCredit', () => {
  it('flips the flag and stamps updatedAt on entries that need it', () => {
    const october = [entry('other', 'cat-y', false)]
    const serviceReports: TimeEntriesByYear = {
      2026: {
        8: [
          entry('off', 'cat-x', false),
          entry('unset', 'cat-x', undefined),
          entry('already', 'cat-x', true, 5),
          entry('standard', undefined, undefined),
        ],
        9: october,
      },
    }

    const result = restampTimeEntriesCredit(serviceReports, 'cat-x', true)

    expect(result.changed).toBe(true)
    const september = result.serviceReports[2026][8]
    expect(september.map((e) => [e.id, e.credit, e.updatedAt])).toEqual([
      ['off', true, NOW],
      ['unset', true, NOW],
      ['already', true, 5],
      ['standard', undefined, 1],
    ])
    // Untouched records and month buckets keep their identity.
    expect(september[2]).toBe(serviceReports[2026][8][2])
    expect(result.serviceReports[2026][9]).toBe(october)
    // The input is not mutated.
    expect(serviceReports[2026][8][0]).toEqual(entry('off', 'cat-x', false))
  })

  it('reports no change when every flag already matches', () => {
    const serviceReports: TimeEntriesByYear = {
      2026: {
        8: [entry('off', 'cat-x', false), entry('unset', 'cat-x', undefined)],
      },
    }

    const result = restampTimeEntriesCredit(serviceReports, 'cat-x', false)

    expect(result.changed).toBe(false)
    expect(result.serviceReports[2026][8]).toBe(serviceReports[2026][8])
  })

  it("brings the other device's totals in line after sync", () => {
    const category: Category = {
      id: 'cat-x',
      name: 'Bethel',
      isCredit: false,
      updatedAt: 1,
    }
    const serviceReports: TimeEntriesByYear = {
      2026: {
        8: [entry('a', 'cat-x', false), entry('b', undefined, undefined)],
      },
    }
    const tablet = emptyDevice({ categories: [category], serviceReports })

    // The phone turns Credit on for the Category, as TypeSelectorRow does.
    const phone = emptyDevice({
      categories: [{ ...category, isCredit: true, updatedAt: NOW }],
      serviceReports: restampTimeEntriesCredit(serviceReports, 'cat-x', true)
        .serviceReports,
    })

    const synced = pullFrom(tablet, phone)
    expect(synced.categories[0].isCredit).toBe(true)
    expect(creditMinutes(phone)).toBe(120)
    expect(creditMinutes(synced)).toBe(creditMinutes(phone))
  })
})

describe('normalizeTimeEntriesCredit', () => {
  const categories: Category[] = [
    { id: 'cat-x', name: 'Bethel', isCredit: true, updatedAt: 1 },
    { id: 'cat-y', name: 'Writing', isCredit: false, updatedAt: 1 },
  ]

  it("follows each entry's Category without stamping it", () => {
    const serviceReports: TimeEntriesByYear = {
      2026: {
        8: [
          entry('stale', 'cat-x', false, 7),
          entry('stale-off', 'cat-y', true, 7),
          entry('unset', 'cat-y', undefined),
          entry('gone', 'deleted-cat', true),
          entry('standard', undefined, undefined),
        ],
      },
    }

    const result = normalizeTimeEntriesCredit(serviceReports, categories)

    expect(result.changed).toBe(true)
    expect(
      result.serviceReports[2026][8].map((e) => [e.id, e.credit, e.updatedAt])
    ).toEqual([
      ['stale', true, 7],
      ['stale-off', false, 7],
      ['unset', undefined, 1],
      ['gone', true, 1],
      ['standard', undefined, 1],
    ])
  })

  it('reports no change when every flag already follows its Category', () => {
    const serviceReports: TimeEntriesByYear = {
      2026: { 8: [entry('a', 'cat-x', true), entry('b', 'cat-y', undefined)] },
    }

    const result = normalizeTimeEntriesCredit(serviceReports, categories)

    expect(result.changed).toBe(false)
    expect(result.serviceReports).toBe(serviceReports)
  })

  it('keeps totals on the Category when a stale device logs or edits after the flip', () => {
    const category: Category = {
      id: 'cat-x',
      name: 'Bethel',
      isCredit: false,
      updatedAt: 1,
    }
    const serviceReports: TimeEntriesByYear = {
      2026: { 8: [entry('a', 'cat-x', false)] },
    }
    const phone = emptyDevice({
      categories: [{ ...category, isCredit: true, updatedAt: NOW }],
      serviceReports: restampTimeEntriesCredit(serviceReports, 'cat-x', true)
        .serviceReports,
    })

    // Later, the iPad, which hasn't pulled the change yet, edits the entry and
    // logs another, copying the old flag (as AddTimeScreen does).
    const iPad = emptyDevice({
      categories: [category],
      serviceReports: {
        2026: {
          8: [
            entry('a', 'cat-x', false, NOW + 60_000),
            entry('new', 'cat-x', false, NOW + 60_000),
          ],
        },
      },
    })

    const onPhone = normalized(pullFrom(phone, iPad))
    const onIPad = normalized(pullFrom(iPad, phone))
    for (const device of [onPhone, onIPad]) {
      expect(device.categories[0].isCredit).toBe(true)
      expect(creditMinutes(device)).toBe(240)
    }
  })
})
