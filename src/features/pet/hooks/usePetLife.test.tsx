import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => {
  Object.assign(globalThis, { __DEV__: true, IS_REACT_ACT_ENVIRONMENT: true })
  return { streak: { kind: 'plans' as 'plans' | 'months', count: 0 } }
})

const unlocks = vi.hoisted(() => ({ announce: vi.fn() }))
vi.mock('@/features/pet/lib/unlockAnnounce', () => ({
  announcePetUnlocks: unlocks.announce,
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('react-native-mmkv', () => ({ MMKV: class {} }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/hooks/usePublisher', () => ({
  default: () => ({ entryMode: 'hours' }),
}))
vi.mock('@/hooks/useServiceStreak', () => ({
  default: () => runtime.streak,
}))
vi.mock('@/hooks/useToday', () => ({
  default: () => new Date(2026, 9, 21, 12),
}))
vi.mock('@/stores/preferences', async () => ({
  usePreferences: (await import('zustand')).create(() => ({
    showStreaks: true,
    role: 'regularPioneer',
    earnedBadges: {} as Record<string, { at: number }>,
    roleHistory: undefined,
    devStreakOverride: null as number | null,
  })),
}))
vi.mock('@/stores/serviceReport', async () => ({
  useServiceReport: (await import('zustand')).create(() => ({
    serviceReports: {},
    dayPlans: [],
    recurringPlans: [],
  })),
}))
vi.mock('@/stores/conversationStore', async () => ({
  default: (await import('zustand')).create(() => ({ conversations: [] })),
}))

import { analytics } from '@/lib/analytics'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import type { TimeEntry } from '@/types/timeEntry'
import { PET_RECORD_ID, SECRET_ROOM_ITEMS, type PetRecord } from '@/types/pet'
import usePetLife, { type PetLifeState } from '@/features/pet/hooks/usePetLife'
import { usePetSession } from '@/features/pet/stores/petSession'

const PET: PetRecord = {
  id: PET_RECORD_ID,
  species: 'dog',
  coat: 'gold',
  adoptedOn: '2026-10-01',
  wakes: [],
  keepsakes: [],
  updatedAt: 1,
}

const everyDay = (year: number, from: number, to: number) => {
  const months: Record<number, TimeEntry[]> = {}
  for (let month = from; month <= to; month++) {
    const days = new Date(year, month + 1, 0).getDate()
    months[month] = Array.from({ length: days }, (_, i) => ({
      id: `${month}-${i}`,
      hours: 1,
      minutes: 0,
      date: new Date(Date.UTC(year, month, i + 1, 12)),
    }))
  }
  return { [year]: months }
}

const oneDay = (year: number, from: number, to: number) => {
  const months: Record<number, TimeEntry[]> = {}
  for (let month = from; month <= to; month++)
    months[month] = [
      {
        id: `${year}-${month}`,
        hours: 1,
        minutes: 0,
        date: new Date(Date.UTC(year, month, 3, 12)),
      },
    ]
  return { [year]: months }
}

let latest: PetLifeState | null = null
let renders = 0
const Harness = () => {
  latest = usePetLife()
  renders++
  return null
}
let renderer: ReactTestRenderer | undefined
const mount = () =>
  act(() => {
    renderer = create(<Harness />)
  })
const stored = () => usePet.getState().pet?.earnedRoomItems ?? []

describe('usePetLife secret items', () => {
  beforeEach(() => {
    vi.mocked(analytics.capture).mockClear()
    runtime.streak = { kind: 'plans', count: 0 }
    usePet.setState({ pet: { ...PET }, room: null })
    usePreferences.setState({
      earnedBadges: {},
      devStreakOverride: null,
      showStreaks: true,
    })
    useServiceReport.setState({ serviceReports: {} })
    usePetSession.setState({ devOverride: null })
    latest = null
    renders = 0
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
  })

  it('stores the secrets a badge and the keepsakes open, once', () => {
    usePreferences.setState({ earnedBadges: { 'monthsShared.1': { at: 1 } } })
    usePet.setState({
      pet: { ...PET, keepsakes: [{ kind: 'olive', on: '2026-10-02' }] },
    })
    mount()
    expect(stored()).toEqual(
      expect.arrayContaining(['hat:duck', 'bed:donut', 'bed:clam'])
    )
    expect(latest?.unlockedItems.has('hat:duck')).toBe(true)
    expect(latest?.unlockedItems.has('hat:teapot')).toBe(false)
    expect(analytics.capture).toHaveBeenCalledWith('pet_room_item_unlocked', {
      item: 'hat:duck',
      by: 'secret',
    })

    const settled = renders
    const unlocked = latest?.unlockedItems
    act(() => renderer?.update(<Harness />))
    expect(latest?.unlockedItems).toBe(unlocked)
    expect(renders).toBe(settled + 1)
  })

  it('announces an item that opens up for a settled pet', () => {
    unlocks.announce.mockClear()
    usePreferences.setState({ earnedBadges: { 'monthsShared.1': { at: 1 } } })
    usePet.setState({ pet: { ...PET, earnedRoomItems: ['lamp:pearl'] } })
    mount()
    expect(unlocks.announce).toHaveBeenCalledWith(
      expect.arrayContaining(['hat:duck']),
      expect.any(String)
    )
  })

  it("keeps a new pet's starting room quiet", () => {
    unlocks.announce.mockClear()
    usePreferences.setState({ earnedBadges: { 'monthsShared.1': { at: 1 } } })

    mount()
    act(() => renderer?.unmount())
    usePet.setState({
      pet: { ...PET, adoptedOn: '2026-10-21', earnedRoomItems: ['lamp:pearl'] },
    })
    mount()
    expect(stored()).toEqual(expect.arrayContaining(['hat:duck']))
    expect(unlocks.announce).not.toHaveBeenCalled()
  })

  it('keeps a stored secret open after its rule stops holding', () => {
    usePet.setState({ pet: { ...PET, earnedRoomItems: ['lamp:pearl'] } })
    mount()
    expect(latest?.unlockedItems.has('lamp:pearl')).toBe(true)
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('opens every secret for the dev harness without storing any', () => {
    usePetSession.setState({ devOverride: { secrets: true } })
    mount()
    for (const item of SECRET_ROOM_ITEMS)
      expect(latest?.unlockedItems.has(item)).toBe(true)
    expect(stored()).toEqual([])
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('opens a long run by months out, not by the streak', () => {
    runtime.streak = { kind: 'plans', count: 400 }
    usePet.setState({ pet: { ...PET, adoptedOn: '2025-06-01' }, room: null })
    mount()
    expect(stored()).not.toContain('hat:bush')
    act(() => renderer?.unmount())

    useServiceReport.setState({
      serviceReports: {
        ...oneDay(2025, 5, 11),
        ...oneDay(2026, 0, 9),
      },
    })
    mount()
    expect(stored()).toContain('hat:bush')
    expect(stored()).not.toContain('wallColor:glacier')
  })
})

describe('usePetLife wallet', () => {
  beforeEach(() => {
    usePet.setState({ pet: { ...PET }, room: null })
    useServiceReport.setState({ serviceReports: {} })
    usePetSession.setState({ devOverride: null })
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
  })

  it('earns coins by days out and takes off what was spent', () => {
    useServiceReport.setState({ serviceReports: everyDay(2026, 9, 9) })
    usePet.setState({
      pet: {
        ...PET,
        purchases: [{ item: 'hat:bow', price: 10, on: '2026-10-05' }],
      },
    })
    mount()
    expect(latest?.earned).toBe(21)
    expect(latest?.earnings).toMatchObject({ daysOut: 21, plansKept: 0 })
    expect(latest?.wallet).toBe(11)
    expect(latest?.unlockedItems.has('hat:bow')).toBe(true)
  })

  it('shows the dev harness wallet without storing it', () => {
    usePetSession.setState({ devOverride: { wallet: 40 } })
    mount()
    expect(latest?.wallet).toBe(40)
    expect(usePet.getState().pet?.purchases).toBeUndefined()
  })
})
