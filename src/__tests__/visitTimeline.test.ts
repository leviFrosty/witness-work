import { describe, expect, it } from 'vitest'
import moment from 'moment'
import {
  followUpState,
  gapBetween,
  getJourney,
  getUpNext,
  sortVisitsNewestFirst,
  visitOutcome,
} from '@/features/contacts/lib/visitTimeline'
import { Visit } from '@/types/visit'

const now = moment('2026-06-12T12:00:00').toDate()
const at = (iso: string) => moment(iso).toDate()

const visit = (
  id: string,
  date: string,
  extra: Partial<Visit> = {}
): Visit => ({
  id,
  contact: { id: 'c' },
  date: at(date),
  isBibleStudy: false,
  ...extra,
})

describe('visitOutcome', () => {
  it('derives the outcome from the two booleans, Not at Home winning', () => {
    expect(visitOutcome({ isBibleStudy: true })).toBe('study')
    expect(visitOutcome({ isBibleStudy: false })).toBe('conversation')
    expect(visitOutcome({ isBibleStudy: false, notAtHome: true })).toBe(
      'notAtHome'
    )
    expect(visitOutcome({ isBibleStudy: true, notAtHome: true })).toBe(
      'notAtHome'
    )
  })
})

describe('followUpState', () => {
  const kept = visit('a', '2026-05-29T17:45', {
    followUp: { date: at('2026-06-05T18:00'), notifyMe: true },
  })
  const fulfilling = visit('b', '2026-06-05T18:00')
  const missed = visit('c', '2026-03-12T16:10', {
    notAtHome: true,
    followUp: { date: at('2026-03-19T10:00'), notifyMe: true },
  })
  const dismissed = visit('d', '2026-02-21T10:00', {
    followUp: {
      date: at('2026-02-28T10:00'),
      notifyMe: false,
      dismissed: true,
    },
  })
  const upcoming = visit('e', '2026-06-10T10:00', {
    followUp: { date: at('2026-06-13T18:15'), notifyMe: true },
  })
  const all = [kept, fulfilling, missed, dismissed, upcoming]

  it('covers every state', () => {
    expect(followUpState(fulfilling, all, now)).toBeNull()
    expect(followUpState(kept, all, now)).toBe('kept')
    expect(followUpState(missed, [missed], now)).toBe('missed')
    expect(followUpState(dismissed, all, now)).toBe('dismissed')
    expect(followUpState(upcoming, all, now)).toBe('upcoming')
  })

  it('does not let a visit fulfil its own follow-up', () => {
    const self = visit('s', '2026-06-01T10:00', {
      followUp: { date: at('2026-06-01T09:00'), notifyMe: false },
    })
    expect(followUpState(self, [self], now)).toBe('missed')
  })

  const plannedEvening = visit('p', '2026-06-08T09:00', {
    followUp: { date: at('2026-06-09T17:00'), notifyMe: true },
  })
  const cameMorning = visit('m', '2026-06-09T10:00')
  const answered = [cameMorning, plannedEvening]

  it('keeps a follow-up answered earlier on its day', () => {
    expect(followUpState(plannedEvening, answered, now)).toBe('kept')
  })

  it('keeps it before its time too', () => {
    const thatAfternoon = at('2026-06-09T12:00')
    expect(followUpState(plannedEvening, answered, thatAfternoon)).toBe('kept')
  })
})

describe('getUpNext', () => {
  it('picks the soonest future, non-dismissed follow-up', () => {
    const visits = [
      visit('far', '2026-06-01', {
        followUp: { date: at('2026-08-01'), notifyMe: false },
      }),
      visit('soon', '2026-06-05', {
        followUp: {
          date: at('2026-06-13T18:15'),
          notifyMe: true,
          topic: '  Lesson 12 ',
        },
      }),
      visit('dismissed', '2026-06-06', {
        followUp: {
          date: at('2026-06-12T13:00'),
          notifyMe: true,
          dismissed: true,
        },
      }),
      visit('past', '2026-06-01', {
        followUp: { date: at('2026-06-02'), notifyMe: true },
      }),
    ]
    const upNext = getUpNext(visits, now)
    expect(upNext?.visit.id).toBe('soon')
    expect(upNext?.topic).toBe('Lesson 12')
  })

  it('returns null without a future follow-up', () => {
    expect(getUpNext([visit('a', '2026-06-01')], now)).toBeNull()
  })

  it('skips a follow-up a visit already answered', () => {
    const planned = visit('planned', '2026-06-11T09:00', {
      followUp: { date: at('2026-06-12T17:00'), notifyMe: true },
    })

    const came = visit('came', '2026-06-12T10:00')
    expect(getUpNext([came, planned], now)).toBeNull()
  })
})

describe('getJourney', () => {
  const visits = [
    visit('old', '2025-01-17', { isBibleStudy: true }),
    visit('window-start', '2025-12-12T12:00'),
    visit('nah', '2026-03-12', { notAtHome: true, isBibleStudy: true }),
    visit('today', '2026-06-12T12:00', { isBibleStudy: true }),
  ]

  it('totals the whole history but only places the last six months', () => {
    const journey = getJourney(visits, now)!
    expect(journey.visitCount).toBe(4)
    expect(journey.outcomeCounts).toEqual({
      study: 2,
      conversation: 1,
      notAtHome: 1,
    })
    expect(journey.first).toEqual(at('2025-01-17'))
    expect(journey.windowStart).toEqual(at('2025-12-12T12:00'))
    expect(journey.olderCount).toBe(1)
    expect(journey.dots.map((d) => d.id)).toEqual([
      'window-start',
      'nah',
      'today',
    ])
  })

  it('puts today at the end without a follow-up', () => {
    const journey = getJourney(visits, now)!
    expect(journey.todayPosition).toBe(1)
    expect(journey.dots[0].position).toBeCloseTo(0)
    expect(journey.dots[2].position).toBeCloseTo(1)
  })

  it('reserves a future segment ending at the next follow-up', () => {
    const next = at('2026-06-22T12:00')
    const journey = getJourney(
      [...visits, visit('future', '2026-06-17T12:00')],
      now,
      next
    )!
    expect(journey.todayPosition).toBe(0.8)
    expect(journey.dots.find((d) => d.id === 'today')?.position).toBeCloseTo(
      0.8
    )
    expect(journey.dots.find((d) => d.id === 'future')?.position).toBeCloseTo(
      0.9
    )
  })

  it.each([undefined, at('2026-06-22T12:00')])(
    'uses a three-day history across the past segment (follow-up: %s)',
    (next) => {
      const journey = getJourney(
        [
          visit('recent', '2026-06-11T12:00'),
          visit('first', '2026-06-09T12:00'),
          visit('today', '2026-06-12T12:00'),
        ],
        now,
        next
      )!
      expect(journey.windowStart).toEqual(at('2026-06-09T12:00'))
      expect(journey.olderCount).toBe(0)
      expect(journey.dots.map((d) => d.position)).toEqual([
        0,
        (journey.todayPosition * 2) / 3,
        journey.todayPosition,
      ])
    }
  )

  it.each([undefined, at('2026-06-22T12:00')])(
    'places a history starting exactly now at today (follow-up: %s)',
    (next) => {
      const journey = getJourney(
        [visit('today', '2026-06-12T12:00')],
        now,
        next
      )!
      expect(journey.windowStart).toEqual(now)
      expect(journey.dots[0].position).toBe(journey.todayPosition)
    }
  )

  it('keeps future-only visits on a finite axis starting at today', () => {
    const journey = getJourney(
      [visit('future', '2026-06-17T12:00')],
      now,
      at('2026-06-22T12:00')
    )!
    expect(journey.windowStart).toEqual(now)
    expect(journey.dots[0].position).toBeCloseTo(0.9)
  })

  it('returns null for an empty history', () => {
    expect(getJourney([], now)).toBeNull()
  })
})

describe('sortVisitsNewestFirst', () => {
  it('orders newest first and breaks timestamp ties by id', () => {
    const sorted = sortVisitsNewestFirst([
      visit('tie-b', '2026-05-01T09:00'),
      visit('old', '2026-01-01T09:00'),
      visit('tie-a', '2026-05-01T09:00'),
    ])
    expect(sorted.map((v) => v.id)).toEqual(['tie-a', 'tie-b', 'old'])
  })
})

describe('gapBetween', () => {
  it('humanizes day gaps and flags same-day pairs', () => {
    expect(
      gapBetween(at('2026-06-05T18:00'), at('2026-06-05T09:00'))
    ).toBeNull()
    expect(gapBetween(at('2026-06-05T01:00'), at('2026-05-29T23:00'))).toBe(
      '7 days'
    )
  })
})
