import { describe, expect, it } from 'vitest'
import {
  buildScheduleRows,
  monthRows,
  type ScheduleMonthRow,
  type ScheduleRow,
  type ScheduleWeekRow,
} from '@/features/plans/lib/scheduleRows'

const build = (startOfWeek = 0) =>
  buildScheduleRows({
    firstServiceYear: 2025,
    lastServiceYear: 2026,
    startOfWeek,
  })

const days = (row: ScheduleRow) =>
  (row as ScheduleWeekRow).days.map((day) => day?.day ?? null)

describe('buildScheduleRows', () => {
  it('splits a week that straddles two months under the new month’s name', () => {
    const schedule = build()
    const october = monthRows(schedule, { year: 2026, month: 9 })!
    // Oct 1 2026 is a Thursday: Sep 27–30 end September's last week…
    expect(days(schedule.rows[october.header - 1])).toEqual([
      27,
      28,
      29,
      30,
      null,
      null,
      null,
    ])
    // …October's name sits over Thursday's column…
    expect(schedule.rows[october.header]).toMatchObject({
      kind: 'month',
      month: { year: 2026, month: 9 },
      column: 4,
    })
    // …and Oct 1–3 open its first week.
    expect(october.first).toBe(october.header + 1)
    expect(days(schedule.rows[october.first])).toEqual([
      null,
      null,
      null,
      null,
      1,
      2,
      3,
    ])
    expect(schedule.rows[october.first]).toMatchObject({ firstOfMonth: true })
    expect(schedule.rows[october.first + 1]).toMatchObject({
      firstOfMonth: false,
    })
  })

  it('keeps every week row inside one month', () => {
    for (const row of build().rows) {
      if (row.kind !== 'week') continue
      for (const day of row.days) {
        if (!day) continue
        expect({ year: day.year, month: day.month }).toEqual(row.month)
      }
    }
  })

  it('opens each Service Year with a divider before September’s name', () => {
    const schedule = build()
    const september = monthRows(schedule, { year: 2026, month: 8 })!
    expect(schedule.rows[september.header - 1]).toMatchObject({
      kind: 'serviceYear',
      serviceYear: 2026,
    })
    // Aug 30–31 2026 end the previous Service Year's last row.
    expect(days(schedule.rows[september.header - 2])).toEqual([
      30,
      31,
      null,
      null,
      null,
      null,
      null,
    ])
  })

  it('starts and ends on the Service Years asked for', () => {
    const { rows } = build()
    expect(rows[0]).toMatchObject({ kind: 'serviceYear', serviceYear: 2025 })
    expect(rows[1]).toMatchObject({
      kind: 'month',
      month: { year: 2025, month: 8 },
    })
    const last = rows[rows.length - 1] as ScheduleWeekRow
    expect(last.days.filter(Boolean).pop()?.key).toBe('2027-08-31')
  })

  it('follows the Start of Week', () => {
    const schedule = build(1)
    const november = monthRows(schedule, { year: 2026, month: 10 })!
    // Nov 1 2026 is a Sunday: the last column of a Monday-first week.
    expect((schedule.rows[november.header] as ScheduleMonthRow).column).toBe(6)
    expect(days(schedule.rows[november.first])).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      1,
    ])
  })
})

describe('row lookups', () => {
  it('finds the rows a month spans and the row of each day', () => {
    const schedule = build()
    const rows = monthRows(schedule, { year: 2026, month: 9 })!
    // October 2026 (Sunday-first) runs over five week rows.
    expect(rows.last - rows.first).toBe(4)
    expect(schedule.dayRow.get('2026-10-01')).toBe(rows.first)
    expect(schedule.dayRow.get('2026-10-31')).toBe(rows.last)
    expect(monthRows(schedule, { year: 2030, month: 0 })).toBeUndefined()
  })
})
