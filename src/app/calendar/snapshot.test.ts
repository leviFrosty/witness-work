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
  defaultInclude: false,
  alertMinutes: new Map<string, number>(),
  title: 'Follow-up',
})

describe('calendar projection', () => {
  it('exports deliberate date-only follow-ups without disclosing contact details', () => {
    const result = buildCalendarSnapshot(input())
    expect(result.title).toBe('Follow-up')
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
      ).toEqual({
        title: 'Follow-up',
        deletedContactIds: [],
        entries: [],
        removed: ['visit-1'],
      })
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
        title: 'Follow-up',
        deletedContactIds: value.deletedContactIds,
        entries: [],
        removed: ['visit-1'],
      })
  })
  it('does not infer deletion from missing data', () => {
    expect(buildCalendarSnapshot({ ...input(), contacts: [] })).toEqual({
      title: 'Follow-up',
      deletedContactIds: [],
      entries: [],
      removed: [],
    })
  })
  it('follow-ups without their own choice follow the shared default', () => {
    const unset = {
      ...input(),
      visits: [visit({ calendarIncluded: undefined })],
    }
    expect(
      buildCalendarSnapshot({ ...unset, defaultInclude: true }).entries
    ).toHaveLength(1)
    // Turning the default off removes events it added.
    expect(buildCalendarSnapshot(unset)).toMatchObject({
      entries: [],
      removed: ['visit-1'],
    })
    // An explicit choice wins over the default either way.
    expect(
      buildCalendarSnapshot({
        ...input(),
        defaultInclude: true,
        visits: [visit({ calendarIncluded: false })],
      }).entries
    ).toEqual([])
  })
  it('treats a malformed inclusion from an old payload as unset', () => {
    const malformed = visit()
    Object.assign(malformed.followUp!, { calendarIncluded: 'false' })
    expect(
      buildCalendarSnapshot({ ...input(), visits: [malformed] }).entries
    ).toEqual([])
    expect(
      buildCalendarSnapshot({
        ...input(),
        defaultInclude: true,
        visits: [malformed],
      }).entries
    ).toHaveLength(1)
  })

  it('carries the follow-up reminder as the event alert, and none without one', () => {
    expect(buildCalendarSnapshot(input()).entries[0]).not.toHaveProperty(
      'alertMinutes'
    )
    expect(
      buildCalendarSnapshot({
        ...input(),
        alertMinutes: new Map([['visit-1', 0]]),
      }).entries[0].alertMinutes
    ).toBe(0)
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
  it.each([
    new Date(NaN),
    new Date('1969-12-31T23:59:59Z'),
    new Date('2100-01-01T00:00:00Z'),
    new Date('2099-12-31T23:30:00Z'),
    new Date('2200-01-01T00:00:00Z'),
  ])('skips unsupported date %s without blocking valid Follow-ups', (date) => {
    const result = buildCalendarSnapshot({
      ...input(),
      visits: [visit({ date }), { ...visit(), id: 'visit-2' }],
    })
    expect(result.entries.map((entry) => entry.key)).toEqual(['visit-2'])
    // Malformed dates must leave an already-published event intact.
    expect(result.removed).toEqual([])
  })
  it('accepts appointments wholly inside the native date bounds', () => {
    const result = buildCalendarSnapshot({
      ...input(),
      visits: [
        visit({ date: new Date('1970-01-01T00:00:00Z') }),
        {
          ...visit({ date: new Date('2099-12-31T23:29:59.999Z') }),
          id: 'visit-2',
        },
      ],
    })
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].start).toBe(0)
    expect(result.entries[1].end).toBe(Date.parse('2100-01-01T00:00:00Z') - 1)
  })
  it('carries the generic title when contact data is missing', () => {
    expect(
      buildCalendarSnapshot({
        ...input(),
        contacts: [],
        title: 'Localized title',
      })
    ).toEqual({
      title: 'Localized title',
      deletedContactIds: [],
      entries: [],
      removed: [],
    })
  })
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
