import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  getPeriodTense,
  getStatusKey,
  segmentBoldMarkup,
} from '@/lib/projectedTotalCopy'

describe('getPeriodTense', () => {
  it('returns "present" when today falls inside the month scope', () => {
    expect(
      getPeriodTense(
        { kind: 'month', year: 2026, month: 4 },
        new Date('2026-05-15')
      )
    ).toBe('present')
  })

  it('returns "past" for a month scope already ended', () => {
    expect(
      getPeriodTense(
        { kind: 'month', year: 2026, month: 3 },
        new Date('2026-05-15')
      )
    ).toBe('past')
  })

  it('returns "future" for a month scope yet to begin', () => {
    expect(
      getPeriodTense(
        { kind: 'month', year: 2026, month: 7 },
        new Date('2026-05-15')
      )
    ).toBe('future')
  })

  it('treats today on the first day of the period as "present"', () => {
    expect(
      getPeriodTense(
        { kind: 'month', year: 2026, month: 4 },
        new Date('2026-05-01')
      )
    ).toBe('present')
  })

  it('returns "present" for a service-year scope spanning today', () => {
    expect(
      getPeriodTense(
        { kind: 'serviceYear', serviceYear: 2025 },
        new Date('2026-05-15')
      )
    ).toBe('present')
  })

  it('returns "past" for an earlier service year', () => {
    expect(
      getPeriodTense(
        { kind: 'serviceYear', serviceYear: 2023 },
        new Date('2026-05-15')
      )
    ).toBe('past')
  })
})

describe('getStatusKey', () => {
  it('returns present-tense key for current month + reachable_gap', () => {
    expect(getStatusKey('reachable_gap', 'present')).toBe(
      'projectedTotal.status.present.reachable_gap'
    )
  })

  it('returns past-tense key for an ended month + unreachable_gap', () => {
    expect(getStatusKey('unreachable_gap', 'past')).toBe(
      'projectedTotal.status.past.unreachable_gap'
    )
  })

  it('returns future-tense key for empty state on an upcoming month', () => {
    expect(getStatusKey('empty', 'future')).toBe(
      'projectedTotal.status.future.empty'
    )
  })

  it('falls back to present tense when a state+tense combo is unsupported', () => {
    // past tense has no `reachable_gap` (a goal you missed but could have hit
    // isn't a status worth narrating) — fall back to present-tense copy.
    expect(getStatusKey('reachable_gap', 'past')).toBe(
      'projectedTotal.status.present.reachable_gap'
    )
  })
})

describe('segmentBoldMarkup', () => {
  it('returns a single non-bold segment when there is no markup', () => {
    expect(segmentBoldMarkup('No plans scheduled yet.')).toEqual([
      { text: 'No plans scheduled yet.', bold: false },
    ])
  })

  it('extracts bold ranges around plain text', () => {
    expect(
      segmentBoldMarkup('Planned hours put you at **42 hrs** — short.')
    ).toEqual([
      { text: 'Planned hours put you at ', bold: false },
      { text: '42 hrs', bold: true },
      { text: ' — short.', bold: false },
    ])
  })

  it('handles a string that starts and ends with bold segments', () => {
    expect(segmentBoldMarkup('**42 hrs** short of **50 hrs**')).toEqual([
      { text: '42 hrs', bold: true },
      { text: ' short of ', bold: false },
      { text: '50 hrs', bold: true },
    ])
  })
})
