import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import {
  buildServiceHistoryRows,
  clearedRow,
  copiedFromPreviousRow,
  rowsDiffer,
  type ServiceHistoryRow,
} from '@/features/service-reports/lib/serviceHistoryRows'

const row = (
  overrides: Partial<ServiceHistoryRow> = {}
): ServiceHistoryRow => ({
  target: { year: 2025, month: 8 },
  savedStatus: 'publisher',
  status: 'publisher',
  loggedMinutes: null,
  hours: '',
  creditHours: '',
  shared: false,
  ...overrides,
})

describe('copiedFromPreviousRow', () => {
  it('copies status and entered time between empty months', () => {
    const rows = [
      row({ status: 'regularAuxiliary', hours: '30', creditHours: '5' }),
      row({ target: { year: 2025, month: 9 } }),
    ]
    expect(copiedFromPreviousRow(rows, 1)).toMatchObject({
      target: { year: 2025, month: 9 },
      status: 'regularAuxiliary',
      hours: '30',
      creditHours: '5',
    })
  })

  it('copies only the status when either month has logged time', () => {
    const rows = [
      row({ status: 'regularAuxiliary', loggedMinutes: 600 }),
      row({ hours: '4' }),
    ]
    expect(copiedFromPreviousRow(rows, 1)).toMatchObject({
      status: 'regularAuxiliary',
      hours: '4',
    })
  })

  it('leaves the first month alone', () => {
    const rows = [row({ hours: '2' })]
    expect(copiedFromPreviousRow(rows, 0)).toBe(rows[0])
  })
})

describe('clearedRow', () => {
  it('returns to the saved status with nothing entered', () => {
    const edited = row({ status: 'regularAuxiliary', hours: '3', shared: true })
    const cleared = clearedRow(edited)
    expect(cleared).toMatchObject({
      status: 'publisher',
      hours: '',
      creditHours: '',
      shared: false,
    })
    expect(rowsDiffer(cleared, edited)).toBe(true)
    expect(rowsDiffer(clearedRow(cleared), cleared)).toBe(false)
  })
})

describe('buildServiceHistoryRows', () => {
  it('lists finished months with their saved status and logged time', () => {
    const rows = buildServiceHistoryRows({
      serviceYear: 2025,
      role: 'regularPioneer',
      roleHistory: null,
      monthlyGoalOverrides: {},
      serviceReports: {
        2025: {
          9: [
            { id: 'a', date: new Date(2025, 9, 3), hours: 2, minutes: 30 },
            { id: 'b', date: new Date(2025, 9, 4), hours: 1, minutes: 0 },
          ],
        },
      },
      now: new Date(2025, 11, 15),
    })
    // September–November; December is still running.
    expect(rows.map((r) => r.target)).toEqual([
      { year: 2025, month: 8 },
      { year: 2025, month: 9 },
      { year: 2025, month: 10 },
    ])
    expect(rows.map((r) => r.loggedMinutes)).toEqual([null, 210, null])
    expect(rows[0]).toMatchObject({
      savedStatus: 'regularPioneer',
      status: 'regularPioneer',
      hours: '',
      creditHours: '',
      shared: false,
    })
  })
})
