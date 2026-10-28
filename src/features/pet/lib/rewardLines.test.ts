import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('react-native-mmkv', () => ({ MMKV: class {} }))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import { NO_EARNINGS, type Earned } from '@/features/pet/lib/currency'
import {
  earnedCounts,
  rewardLines,
  type EarnedCounts,
} from '@/features/pet/lib/rewardLines'

const BEFORE: EarnedCounts = earnedCounts({
  ...NO_EARNINGS,
  daysOut: 4,
  plansKept: 2,
  milestones: [{ count: 3, on: '2026-10-02' }],
})

const after = (patch: Partial<Earned>): Earned => ({
  daysOut: 4,
  plansKept: 2,
  shared: 0,
  milestones: [{ count: 3, on: '2026-10-02' }],
  ...patch,
})

describe('rewardLines', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 12))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('names the day out by the save, then the planned day kept', () => {
    const lines = rewardLines(
      BEFORE,
      after({ daysOut: 5, plansKept: 3 }),
      'time',
      'plans'
    )
    expect(lines).toEqual([
      { amount: 1, label: 'Time added', tone: 'base' },
      {
        amount: 1,
        label: 'Planned day kept',
        tone: 'bonus',
      },
    ])
    expect(
      rewardLines(BEFORE, after({ daysOut: 5 }), 'visit', 'plans')
    ).toEqual([{ amount: 1, label: 'Visit added', tone: 'base' }])
  })

  it('ends on each new milestone, held for a celebration only when recent', () => {
    const lines = rewardLines(
      BEFORE,
      after({
        daysOut: 5,
        plansKept: 3,
        milestones: [
          { count: 3, on: '2026-10-02' },
          { count: 5, on: '2026-10-21' },
        ],
      }),
      'time',
      'plans'
    )
    expect(lines.at(-1)).toEqual({
      amount: 10,
      label: 'Streak milestone · 5',
      tone: 'milestone',
      celebration: true,
    })
    const backfilled = rewardLines(
      BEFORE,
      after({
        milestones: [
          { count: 3, on: '2026-10-02' },
          { count: 5, on: '2026-10-12' },
        ],
      }),
      'time',
      'plans'
    )
    expect(backfilled).toEqual([
      expect.objectContaining({ amount: 10, celebration: false }),
    ])
  })

  it('names a month shared, with what the monthly least added to its day', () => {
    const lines = rewardLines(
      BEFORE,
      after({ daysOut: 5, shared: 7 }),
      'checkbox',
      'months'
    )
    expect(lines).toEqual([{ amount: 8, label: 'Month shared', tone: 'bonus' }])
  })

  it('earns nothing for a day out the monthly least already paid for', () => {
    const before = { ...BEFORE, shared: 4 }
    expect(
      rewardLines(before, after({ daysOut: 5, shared: 3 }), 'visit', 'months')
    ).toEqual([])
  })

  it('totals what was earned elsewhere, and names months for that kind', () => {
    const lines = rewardLines(
      BEFORE,
      after({
        daysOut: 7,
        plansKept: 4,
        milestones: [
          { count: 3, on: '2026-10-02' },
          { count: 4, on: '2026-10-20' },
        ],
      }),
      'elsewhere',
      'months'
    )
    expect(lines.map(({ amount, label }) => `+${amount} ${label}`)).toEqual([
      '+3 Days out',
      '+2 Planned days kept',
      '+10 Streak milestone · 4 months',
    ])
    expect(lines.some((line) => line.celebration)).toBe(false)
  })

  it('says nothing for what went down', () => {
    expect(rewardLines(BEFORE, after({ daysOut: 3 }), 'time', 'plans')).toEqual(
      []
    )
  })
})
