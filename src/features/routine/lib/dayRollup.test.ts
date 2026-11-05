import { describe, expect, it } from 'vitest'
import {
  EMPTY_DAY_LOG,
  flushDayLog,
  recordDayCheck,
} from '@/features/routine/lib/dayRollup'

describe('routine day rollup', () => {
  it('collects a day of checks without reporting it yet', () => {
    let step = recordDayCheck(
      EMPTY_DAY_LOG,
      '2026-11-05',
      'bibleReading',
      false
    )
    step = recordDayCheck(step.log, '2026-11-05', 'worship', true)
    step = recordDayCheck(step.log, '2026-11-05', 'bibleReading', false)
    expect(step.report).toBeNull()
    expect(step.log).toEqual({
      day: '2026-11-05',
      habits: ['bibleReading', 'worship'],
      count: 3,
      backfilled: 1,
    })
  })

  it('reports the day once a later day starts, then starts over', () => {
    const first = recordDayCheck(
      EMPTY_DAY_LOG,
      '2026-11-05',
      'worship',
      false
    ).log
    const next = recordDayCheck(first, '2026-11-06', 'bibleReading', false)
    expect(next.report).toEqual({ habits: 'worship', count: 1, backfilled: 0 })
    expect(next.log).toMatchObject({ day: '2026-11-06', count: 1 })
  })

  it('flushes only days before today', () => {
    const log = recordDayCheck(
      EMPTY_DAY_LOG,
      '2026-11-05',
      'midweekPrep',
      false
    ).log
    expect(flushDayLog(log, '2026-11-05')).toEqual({ log, report: null })
    expect(flushDayLog(log, '2026-11-07')).toEqual({
      log: EMPTY_DAY_LOG,
      report: { habits: 'midweekPrep', count: 1, backfilled: 0 },
    })
    expect(flushDayLog(EMPTY_DAY_LOG, '2026-11-07').report).toBeNull()
  })
})
