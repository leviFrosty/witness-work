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
  routine: NO_EARNINGS.routine,
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
      { amount: 10, label: 'Time added', tone: 'base' },
      {
        amount: 10,
        label: 'Planned day kept',
        tone: 'bonus',
      },
    ])
    expect(
      rewardLines(BEFORE, after({ daysOut: 5 }), 'visit', 'plans')
    ).toEqual([{ amount: 10, label: 'Visit added', tone: 'base' }])
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
      amount: 100,
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
      expect.objectContaining({ amount: 100, celebration: false }),
    ])
  })

  it('names a month shared, with what the monthly least added to its day', () => {
    const lines = rewardLines(
      BEFORE,
      after({ daysOut: 5, shared: 70 }),
      'checkbox',
      'months'
    )
    expect(lines).toEqual([
      { amount: 80, label: 'Month shared', tone: 'bonus' },
    ])
  })

  it('earns nothing for a day out the monthly least already paid for', () => {
    const before = { ...BEFORE, shared: 40 }
    expect(
      rewardLines(before, after({ daysOut: 5, shared: 30 }), 'visit', 'months')
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
      '+30 Days out',
      '+20 Planned days kept',
      '+100 Streak milestone · 4 months',
    ])
    expect(lines.some((line) => line.celebration)).toBe(false)
  })

  it('names each Spiritual Routine habit and a finished reading plan', () => {
    const lines = rewardLines(
      BEFORE,
      after({
        routine: {
          habits: {
            ...NO_EARNINGS.routine.habits,
            bibleReading: 1,
            midweekPrep: 1,
          },
          plansFinished: 1,
        },
      }),
      'routine',
      'plans'
    )
    expect(lines.map(({ amount, label }) => `+${amount} ${label}`)).toEqual([
      '+4 Bible reading',
      '+5 Midweek meeting prep',
      '+500 Reading plan finished',
    ])
  })

  it('lists no Spiritual Routine lines against counts saved before it existed', () => {
    const { routine: _routine, plansFinished: _finished, ...old } = BEFORE
    expect(
      rewardLines(
        old,
        after({
          routine: {
            habits: { ...NO_EARNINGS.routine.habits, bibleReading: 30 },
            plansFinished: 0,
          },
        }),
        'elsewhere',
        'plans'
      )
    ).toEqual([])
  })

  it('says nothing for what went down', () => {
    expect(rewardLines(BEFORE, after({ daysOut: 3 }), 'time', 'plans')).toEqual(
      []
    )
  })
})
