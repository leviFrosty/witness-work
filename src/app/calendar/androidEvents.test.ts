import { describe, expect, it } from 'vitest'
import type {
  AndroidCalendarEvent,
  CalendarEntry,
  CalendarSnapshot,
} from '../../../modules/calendar-bridge'
import {
  eventDescription,
  parseEventMarker,
  planAndroidPublish,
} from '@/app/calendar/androidEvents'

const NOW = Date.parse('2026-10-07T12:00:00Z')
const HOUR = 3_600_000

const entry = (overrides: Partial<CalendarEntry> = {}): CalendarEntry => ({
  key: 'visit-1',
  title: 'Follow-up',
  start: NOW + 24 * HOUR,
  end: NOW + 24 * HOUR + 30 * 60_000,
  url: 'witnesswork://contact/contact-1/visit-1',
  location: '',
  ...overrides,
})
const event = (
  source: CalendarEntry,
  overrides: Partial<AndroidCalendarEvent> = {}
): AndroidCalendarEvent => ({
  id: '10',
  syncId: null,
  title: source.title,
  start: source.start,
  end: source.end,
  location: source.location,
  description: eventDescription(source),
  allDay: false,
  ...overrides,
})
const snapshot = (
  overrides: Partial<CalendarSnapshot> = {}
): CalendarSnapshot => ({
  title: 'Follow-up',
  deletedContactIds: [],
  entries: [],
  removed: [],
  ...overrides,
})
const plan = (
  events: AndroidCalendarEvent[],
  overrides: Partial<CalendarSnapshot> = {},
  includeDetails = false
) =>
  planAndroidPublish({
    events,
    snapshot: snapshot(overrides),
    includeDetails,
    now: NOW,
  })

describe('Android event marker', () => {
  it('round-trips the Follow-up key and contact', () => {
    const description = eventDescription(entry({ alertMinutes: 30 }))
    expect(description).toBe(
      'witnesswork://contact/contact-1/visit-1?followUp=visit-1&alert=30'
    )
    expect(parseEventMarker(description)).toEqual({
      key: 'visit-1',
      contactId: 'contact-1',
      alert: '30',
    })
  })

  it('reads the link after a provider turns it into HTML', () => {
    const description = eventDescription(entry({ alertMinutes: 30 }))
    const html = `<a href="${description.replace('&', '&amp;')}">${description.replace('&', '&amp;')}</a>`
    expect(parseEventMarker(html)).toEqual({
      key: 'visit-1',
      contactId: 'contact-1',
      alert: '30',
    })
  })

  it('records no alert when Notify Me is off or out of range', () => {
    expect(eventDescription(entry())).toContain('&alert=none')
    expect(eventDescription(entry({ alertMinutes: -5 }))).toContain(
      '&alert=none'
    )
    expect(eventDescription(entry({ alertMinutes: 50_000 }))).toContain(
      '&alert=none'
    )
  })

  it('decodes escaped ids and finds the link inside edited text', () => {
    const description = eventDescription(
      entry({
        key: 'visit/1',
        url: 'witnesswork://contact/contact%2F1/visit%2F1',
      })
    )
    expect(parseEventMarker(`Notes\n${description}\nmore`)).toEqual({
      key: 'visit/1',
      contactId: 'contact/1',
      alert: 'none',
    })
  })

  it('ignores descriptions without a WitnessWork Follow-up link', () => {
    expect(parseEventMarker('Lunch with Sam')).toBeNull()
    expect(parseEventMarker('witnesswork://contact/c/v')).toBeNull()
    expect(parseEventMarker('witnesswork://contact/c/v?alert=5')).toBeNull()
    expect(
      parseEventMarker('witnesswork://contact/%E0%A4%A/v?followUp=v')
    ).toBeNull()
  })
})

describe('planAndroidPublish', () => {
  it('inserts upcoming Follow-ups with their alert', () => {
    const { writes, deletes } = plan([], {
      entries: [entry({ alertMinutes: 15 })],
    })
    expect(deletes).toEqual([])
    expect(writes).toEqual([
      {
        title: 'Follow-up',
        start: entry().start,
        end: entry().end,
        location: '',
        description:
          'witnesswork://contact/contact-1/visit-1?followUp=visit-1&alert=15',
        alertMinutes: 15,
        resetAlert: true,
      },
    ])
  })

  it('is a no-op when the calendar already matches', () => {
    const current = entry({ alertMinutes: 15 })
    expect(plan([event(current)], { entries: [current] })).toEqual({
      writes: [],
      deletes: [],
    })
  })

  it('leaves an event alone when only the description text around the link changed', () => {
    const current = entry({ alertMinutes: 15 })
    const description = `Bring tracts\n${eventDescription(current).replace('&', '&amp;')}`
    expect(
      plan([event(current, { description })], { entries: [current] })
    ).toEqual({ writes: [], deletes: [] })
  })

  it('updates the existing event instead of adding another on reschedule', () => {
    const before = entry()
    const after = entry({ start: before.start + HOUR, end: before.end + HOUR })
    const { writes, deletes } = plan([event(before)], { entries: [after] })
    expect(deletes).toEqual([])
    expect(writes).toEqual([
      expect.objectContaining({ id: '10', start: after.start, end: after.end }),
    ])
  })

  it('rewrites the alert when Notify Me changes, but not for provider reminders', () => {
    const current = entry({ alertMinutes: 15 })
    const changed = { ...current, alertMinutes: 60 }
    expect(plan([event(current)], { entries: [changed] }).writes).toEqual([
      expect.objectContaining({
        id: '10',
        alertMinutes: 60,
        resetAlert: true,
      }),
    ])
  })

  it('restores fields edited in the calendar app', () => {
    const current = entry()
    expect(
      plan([event(current, { title: 'Renamed', allDay: true })], {
        entries: [current],
      }).writes
    ).toEqual([
      expect.objectContaining({
        id: '10',
        title: 'Follow-up',
        resetAlert: true,
      }),
    ])
  })

  it('recreates a missing upcoming event but never backfills a past one', () => {
    const upcoming = entry()
    const past = entry({
      key: 'visit-2',
      url: 'witnesswork://contact/contact-1/visit-2',
      start: NOW - 2 * HOUR,
      end: NOW - HOUR,
    })
    const { writes } = plan([], { entries: [upcoming, past] })
    expect(writes.map((write) => write.description)).toEqual([
      eventDescription(upcoming),
    ])
  })

  it('keeps updating a past event that already exists', () => {
    const past = entry({ start: NOW - 2 * HOUR, end: NOW - HOUR })
    const moved = { ...past, end: past.end + HOUR }
    expect(plan([event(past)], { entries: [moved] }).writes).toEqual([
      expect.objectContaining({ id: '10', end: moved.end }),
    ])
  })

  it('removes explicitly removed Follow-ups and deleted contacts only', () => {
    const removed = entry()
    const other = entry({
      key: 'visit-2',
      url: 'witnesswork://contact/contact-2/visit-2',
    })
    const unknown = entry({
      key: 'visit-3',
      url: 'witnesswork://contact/contact-3/visit-3',
    })
    const { writes, deletes } = plan(
      [
        event(removed, { id: '1' }),
        event(other, { id: '2' }),
        event(unknown, { id: '3' }),
      ],
      { removed: ['visit-1'], deletedContactIds: ['contact-2'] }
    )
    // An event this device has no data for is left alone.
    expect(deletes).toEqual(['1', '2'])
    expect(writes).toEqual([])
  })

  it('keeps the same copy of a duplicate on every device', () => {
    const current = entry()
    const events = [
      event(current, { id: '5', syncId: null }),
      event(current, { id: '9', syncId: 'b-server' }),
      event(current, { id: '7', syncId: 'a-server' }),
    ]
    const { writes, deletes } = plan(events, { entries: [current] })
    expect(writes).toEqual([])
    expect(deletes.sort()).toEqual(['5', '9'])
    // Same result in another order, as another device would read them.
    expect(
      plan([...events].reverse(), { entries: [current] }).deletes.sort()
    ).toEqual(['5', '9'])
  })

  it('prefers the lowest id among events that have not synced yet', () => {
    const current = entry()
    expect(
      plan([event(current, { id: '12' }), event(current, { id: '3' })], {
        entries: [current],
      }).deletes
    ).toEqual(['12'])
  })

  it('redacts names and addresses even when the Visit is missing here', () => {
    const detailed = entry({ title: 'Follow-up: Sam', location: '1 Main St' })
    expect(plan([event(detailed)]).writes).toEqual([
      {
        id: '10',
        title: 'Follow-up',
        start: detailed.start,
        end: detailed.end,
        location: '',
        description: eventDescription(detailed),
        resetAlert: false,
      },
    ])
    expect(plan([event(detailed)], {}, true).writes).toEqual([])
  })

  it('ignores events without a WitnessWork link', () => {
    const current = entry()
    expect(
      plan([event(current, { description: 'Lunch' })], { entries: [current] })
    ).toEqual({
      writes: [
        expect.objectContaining({ description: eventDescription(current) }),
      ],
      deletes: [],
    })
  })
})
