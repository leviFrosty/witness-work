import { describe, expect, it } from 'vitest'
import { buildCalendarSnapshot } from '@/app/calendar/snapshot'
import type { Visit } from '@/types/visit'

const visit = (
  followUp: Partial<NonNullable<Visit['followUp']>> = {}
): Visit => ({
  id: 'visit-1',
  contact: { id: 'contact-1' },
  date: new Date('2026-09-23'),
  isBibleStudy: false,
  followUp: {
    date: new Date('2026-11-01T01:30:00-04:00'),
    notifyMe: false,
    calendarIncluded: true,
    ...followUp,
  },
})
const input = () => ({
  visits: [visit()],
  deletedVisits: [],
  contacts: [
    { id: 'contact-1', name: 'Private Name', address: 'Private Address' },
  ],
  deletedContactIds: [] as string[],
  publishedKeys: ['visit-1'],
  includeDetails: false,
  title: 'Follow-up',
})

describe('calendar projection', () => {
  it('exports deliberate date-only follow-ups without disclosing contact details', () => {
    const result = buildCalendarSnapshot(input())
    expect(result.removed).toEqual([])
    expect(result.entries).toEqual([
      {
        key: 'visit-1',
        title: 'Follow-up',
        start: Date.parse('2026-11-01T05:30:00Z'),
        end: Date.parse('2026-11-01T06:00:00Z'),
        location: '',
        url: 'witnesswork://contact/contact-1/visit-1',
      },
    ])
  })
  it('preserves the appointment instant and elapsed duration across a DST transition', () => {
    const result = buildCalendarSnapshot({
      ...input(),
      visits: [visit({ calendarDurationMinutes: 90 })],
    })
    expect(result.entries[0].end - result.entries[0].start).toBe(90 * 60_000)
    expect(result.entries[0].end).toBe(Date.parse('2026-11-01T07:00:00Z'))
  })
  it('rescheduling retains the same logical identity', () => {
    const before = buildCalendarSnapshot(input()).entries[0]
    const after = buildCalendarSnapshot({
      ...input(),
      visits: [visit({ date: new Date('2026-12-01') })],
    }).entries[0]
    expect(after.key).toBe(before.key)
    expect(after.start).not.toBe(before.start)
  })
  it.each([{ dismissed: true }, { calendarIncluded: false }])(
    'removes opted-out or dismissed events: %j',
    (change) => {
      expect(
        buildCalendarSnapshot({ ...input(), visits: [visit(change)] })
      ).toEqual({ entries: [], removed: ['visit-1'] })
    }
  )
  it('removes deleted visits, removed follow-ups, and deleted contacts', () => {
    const cases = [
      {
        ...input(),
        visits: [],
        deletedVisits: [{ id: 'visit-1', deletedAt: 1 }],
      },
      { ...input(), visits: [{ ...visit(), followUp: undefined }] },
      { ...input(), deletedContactIds: ['contact-1'] },
    ]
    for (const value of cases)
      expect(buildCalendarSnapshot(value)).toEqual({
        entries: [],
        removed: ['visit-1'],
      })
  })
  it('does not infer deletion from missing data or a legacy inclusion field', () => {
    expect(buildCalendarSnapshot({ ...input(), contacts: [] })).toEqual({
      entries: [],
      removed: [],
    })
    expect(
      buildCalendarSnapshot({
        ...input(),
        visits: [visit({ calendarIncluded: undefined })],
      })
    ).toEqual({ entries: [], removed: [] })
  })
  it('includes contact details only when selected, never notes or topics', () => {
    const result = buildCalendarSnapshot({
      ...input(),
      includeDetails: true,
      visits: [{ ...visit({ topic: 'private topic' }), note: 'private note' }],
    })
    expect(result.entries[0].title).toBe('Follow-up: Private Name')
    expect(result.entries[0].location).toBe('Private Address')
    expect(JSON.stringify(result)).not.toContain('private topic')
    expect(JSON.stringify(result)).not.toContain('private note')
  })
  it('keeps past entries available to repair previously exported events', () => {
    expect(
      buildCalendarSnapshot({
        ...input(),
        visits: [visit({ date: new Date('2020-01-01') })],
      }).entries
    ).toHaveLength(1)
  })
  it.each([0, -30, 481, NaN, 30.5])(
    'skips invalid duration %s without blocking other follow-ups',
    (duration) => {
      const valid = { ...visit(), id: 'visit-2' }
      const result = buildCalendarSnapshot({
        ...input(),
        visits: [visit({ calendarDurationMinutes: duration }), valid],
      })
      expect(result.entries.map((entry) => entry.key)).toEqual(['visit-2'])
      expect(result.removed).toEqual([])
    }
  )
  it('only sends removals for published follow-ups', () => {
    const history = Array.from({ length: 50 }, (_, index) => ({
      ...visit(),
      id: `old-${index}`,
      followUp: undefined,
    }))
    const result = buildCalendarSnapshot({
      ...input(),
      visits: [...history, { ...visit(), followUp: undefined }],
      deletedVisits: [{ id: 'never-published', deletedAt: 1 }],
    })
    expect(result.removed).toEqual(['visit-1'])
  })
})
