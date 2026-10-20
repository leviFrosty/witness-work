import { describe, expect, it } from 'vitest'
import {
  countLoggedDays,
  daysSinceInstallBucket,
  manualCompletionIdsFor,
  resolveManualCompletions,
} from '@/features/onboarding/lib/homeChecklist'
import { TimeEntry } from '@/types/timeEntry'

const entry = (
  date: Date,
  minutes: number,
  extra: Partial<TimeEntry> = {}
): TimeEntry => ({
  id: `${date.toISOString()}-${minutes}`,
  date,
  hours: 0,
  minutes,
  ...extra,
})

describe('countLoggedDays', () => {
  it('counts distinct days, not entries', () => {
    const reports = {
      '2026': {
        '9': [
          entry(new Date(2026, 9, 1, 9), 60),
          entry(new Date(2026, 9, 1, 15), 30),
          entry(new Date(2026, 9, 2, 9), 45),
        ],
      },
    }
    expect(countLoggedDays(reports)).toBe(2)
  })

  it('counts days across months and years', () => {
    const reports = {
      '2025': { '11': [entry(new Date(2025, 11, 31), 60)] },
      '2026': { '0': [entry(new Date(2026, 0, 1), 60)] },
    }
    expect(countLoggedDays(reports)).toBe(2)
  })

  it('ignores Time Rollover entries but counts the checkbox marker', () => {
    const reports = {
      '2026': {
        '9': [
          entry(new Date(2026, 9, 1), 30, { rollover: true }),
          entry(new Date(2026, 9, 2), 0),
        ],
      },
    }
    expect(countLoggedDays(reports)).toBe(1)
  })

  it('stops at the cap', () => {
    const reports = {
      '2026': {
        '9': [1, 2, 3, 4, 5].map((d) => entry(new Date(2026, 9, d), 60)),
      },
    }
    expect(countLoggedDays(reports)).toBe(3)
    expect(countLoggedDays(reports, 10)).toBe(5)
  })

  it('reads dates rehydrated as strings', () => {
    const reports = {
      '2026': {
        '9': [
          {
            ...entry(new Date(2026, 9, 1), 60),
            date: new Date(2026, 9, 1).toISOString() as unknown as Date,
          },
        ],
      },
    }
    expect(countLoggedDays(reports)).toBe(1)
  })
})

describe('manual completions', () => {
  it('carries a ticked sendFirstReport over to logThreeDays', () => {
    const resolved = resolveManualCompletions([
      'setMonthlyGoal',
      'sendFirstReport',
    ])
    expect(resolved.has('logThreeDays')).toBe(true)
    expect(resolved.has('setMonthlyGoal')).toBe(true)
  })

  it('lists the retired ids to clear when unticking', () => {
    expect(manualCompletionIdsFor('logThreeDays')).toEqual([
      'logThreeDays',
      'sendFirstReport',
    ])
    expect(manualCompletionIdsFor('addFirstContact')).toEqual([
      'addFirstContact',
    ])
  })
})

describe('daysSinceInstallBucket', () => {
  const installed = new Date(2026, 9, 1, 22)
  it.each([
    [new Date(2026, 9, 1, 23), '0'],
    [new Date(2026, 9, 2, 1), '1'],
    [new Date(2026, 9, 4), '2_3'],
    [new Date(2026, 9, 8), '4_7'],
    [new Date(2026, 9, 15), '8_14'],
    [new Date(2026, 9, 31), '15_30'],
    [new Date(2026, 10, 1), 'over_30'],
  ])('buckets %s as %s', (now, bucket) => {
    expect(daysSinceInstallBucket(installed, now)).toBe(bucket)
  })

  it('handles a stored string and a bad clock', () => {
    expect(
      daysSinceInstallBucket(installed.toISOString(), new Date(2026, 9, 3))
    ).toBe('2_3')
    expect(daysSinceInstallBucket(installed, new Date(2026, 8, 1))).toBe(
      'unknown'
    )
  })
})
