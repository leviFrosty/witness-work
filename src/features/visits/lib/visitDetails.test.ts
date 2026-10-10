import moment from 'moment'
import { describe, expect, it, vi } from 'vitest'
import type { Visit } from '@/types/visit'

// The real formatters reach expo-localization.
vi.mock('@/lib/dates', () => ({
  formatTime: () => '7:30 PM',
  formatWeekdayMonthDayCompact: (m: moment.Moment) => m.format('ddd, MMM D'),
  formatDate: (m: moment.Moment) => m.format('MMM D, YYYY'),
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined
        ? key
        : `${key}:${Object.values(options).join('|')}`,
  },
}))

const { followUpStatus, nextVisit, pastSentenceKey, reminderSentence } =
  await import('@/features/visits/lib/visitDetails')

const NOW = new Date('2026-10-08T15:00:00').getTime()

const visit = (
  id: string,
  date: string,
  followUp?: Omit<Partial<NonNullable<Visit['followUp']>>, 'date'> & {
    date: string
  }
): Visit => ({
  id,
  contact: { id: 'ada' },
  date: new Date(date),
  isBibleStudy: false,
  ...(followUp
    ? {
        followUp: {
          notifyMe: false,
          ...followUp,
          date: new Date(followUp.date),
        },
      }
    : {}),
})

describe('followUpStatus', () => {
  it('is null without a Follow-up', () => {
    const v = visit('a', '2026-10-01T10:00:00')
    expect(followUpStatus(v, [v], NOW)).toBeNull()
  })

  it('is upcoming while the Follow-up is ahead', () => {
    const v = visit('a', '2026-10-01T10:00:00', { date: '2026-10-08T18:00:00' })
    expect(followUpStatus(v, [v], NOW)).toBe('upcoming')
  })

  it('is overdue once its time passes with no visit since', () => {
    const v = visit('a', '2026-10-01T10:00:00', { date: '2026-10-07T18:00:00' })
    expect(followUpStatus(v, [v], NOW)).toBe('overdue')
  })

  it('is kept once a visit lands on its day or after', () => {
    const v = visit('a', '2026-10-01T10:00:00', { date: '2026-10-07T18:00:00' })
    // Earlier the same day still counts, as on Home's card.
    const answer = visit('b', '2026-10-07T09:00:00')
    expect(followUpStatus(v, [v, answer], NOW)).toBe('kept')
  })

  it('is dismissed when dismissed, even if a visit followed', () => {
    const v = visit('a', '2026-10-01T10:00:00', {
      date: '2026-10-07T18:00:00',
      dismissed: true,
    })
    const answer = visit('b', '2026-10-07T19:00:00')
    expect(followUpStatus(v, [v, answer], NOW)).toBe('dismissed')
  })
})

describe('nextVisit', () => {
  it("is the contact's first Visit after this one", () => {
    const v = visit('a', '2026-10-01T10:00:00')
    const later = visit('c', '2026-10-09T10:00:00')
    const sooner = visit('b', '2026-10-05T10:00:00')
    const earlier = visit('z', '2026-09-20T10:00:00')
    expect(nextVisit(v, [earlier, v, later, sooner])?.id).toBe('b')
    expect(nextVisit(later, [earlier, v, later, sooner])).toBeUndefined()
  })
})

describe('pastSentenceKey', () => {
  it('says what happened', () => {
    const v = visit('a', '2026-10-01T10:00:00')
    expect(pastSentenceKey(v)).toBe('visitDetails_pastConversation')
    expect(pastSentenceKey({ ...v, isBibleStudy: true })).toBe(
      'visitDetails_pastStudy'
    )
    expect(pastSentenceKey({ ...v, isBibleStudy: true, notAtHome: true })).toBe(
      'visitDetails_pastNotAtHome'
    )
  })
})

describe('reminderSentence', () => {
  const followUp = (notifyMe: boolean) => ({
    date: new Date(NOW),
    notifyMe,
  })

  it('says no reminder when Notify Me is off or the offset is unknown', () => {
    expect(reminderSentence(followUp(false), 30)).toBe(
      'contactDetails.reminderOff'
    )
    expect(reminderSentence(followUp(true), undefined)).toBe(
      'contactDetails.reminderOff'
    )
  })

  it('says when it is time for no offset', () => {
    expect(reminderSentence(followUp(true), 0)).toBe(
      'visitDetails_remindAtTime'
    )
  })

  it('uses the largest unit that divides the offset evenly', () => {
    expect(reminderSentence(followUp(true), 30)).toBe(
      'visitDetails_remindMinutes:30'
    )
    expect(reminderSentence(followUp(true), 90)).toBe(
      'visitDetails_remindMinutes:90'
    )
    expect(reminderSentence(followUp(true), 120)).toBe(
      'visitDetails_remindHours:2'
    )
    expect(reminderSentence(followUp(true), 60 * 24)).toBe(
      'visitDetails_remindDays:1'
    )
    expect(reminderSentence(followUp(true), 60 * 24 * 14)).toBe(
      'visitDetails_remindWeeks:2'
    )
  })
})
