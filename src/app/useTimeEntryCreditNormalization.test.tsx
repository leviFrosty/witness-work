import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { restampTimeEntriesCredit } from '@/lib/categories'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { useTimeEntryCreditNormalization } from './useTimeEntryCreditNormalization'
import type { TimeEntry } from '@/types/timeEntry'

const NOW = 1_790_000_000_000

const entry = (id: string, credit: boolean, updatedAt = 1): TimeEntry => ({
  id,
  hours: 1,
  minutes: 0,
  date: normalizeDateForStorage(new Date(2026, 8, 10)),
  categoryId: 'bethel',
  credit,
  updatedAt,
})

const entries = () =>
  Object.values(useServiceReport.getState().serviceReports).flatMap((months) =>
    Object.values(months).flat()
  )

const Harness = () => {
  useTimeEntryCreditNormalization(true)
  return null
}

let renderer: ReactTestRenderer | undefined

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useCategories.getState().set({
    categories: [
      { id: 'bethel', name: 'Bethel', isCredit: true, updatedAt: 1 },
    ],
    deletedCategories: [],
  })
  useServiceReport.getState().set({
    serviceReports: { 2026: { 8: [entry('stale', false, 5)] } },
    deletedServiceReports: [],
  })
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

it('normalizes at launch without stamping', () => {
  act(() => {
    renderer = create(<Harness />)
  })
  expect(entries().map((e) => [e.credit, e.updatedAt])).toEqual([[true, 5]])
})

it('normalizes entries that arrive with a stale flag', async () => {
  act(() => {
    renderer = create(<Harness />)
  })
  useServiceReport.getState().set({
    serviceReports: { 2026: { 8: [entry('synced', false, 9)] } },
  })
  await Promise.resolve()
  expect(entries().map((e) => [e.id, e.credit, e.updatedAt])).toEqual([
    ['synced', true, 9],
  ])
})

it('leaves the Credit switch to stamp the entries it flips', async () => {
  act(() => {
    renderer = create(<Harness />)
  })
  // As TypeSelectorRow does: flip the Category, then restamp its entries.
  useCategories.getState().updateCategory({ id: 'bethel', isCredit: false })
  const restamped = restampTimeEntriesCredit(
    useServiceReport.getState().serviceReports,
    'bethel',
    false
  )
  expect(restamped.changed).toBe(true)
  useServiceReport.getState().set({ serviceReports: restamped.serviceReports })
  await Promise.resolve()

  expect(entries().map((e) => [e.credit, e.updatedAt])).toEqual([[false, NOW]])
})
