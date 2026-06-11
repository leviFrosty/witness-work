import moment from 'moment'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildConversationIndex } from '@/lib/conversationIndex'
import { DEFAULT_STALENESS_BREAKPOINTS } from '@/constants/staleness'
import { Visit } from '@/types/visit'

const visit = (overrides: Partial<Visit> & { contactId: string }): Visit => ({
  id: overrides.id ?? `${overrides.contactId}-${overrides.date}`,
  contact: { id: overrides.contactId },
  date: overrides.date ?? new Date(),
  isBibleStudy: overrides.isBibleStudy ?? false,
})

describe('lib/conversationIndex', () => {
  // Freeze the clock: the on-threshold assertion builds a visit exactly
  // `monthDays` old, and with a live clock the builder's `new Date()` runs a
  // few ms after the visit date is captured, nudging the visit just past the
  // threshold (flaky 'week' vs 'month').
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-12T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('classifies staleness relative to now (never/recent/week/month)', () => {
    const now = moment()
    const conversations: Visit[] = [
      visit({
        contactId: 'recent',
        date: now.clone().subtract(2, 'days').toDate(),
      }),
      visit({
        contactId: 'week',
        date: now.clone().subtract(10, 'days').toDate(),
      }),
      visit({
        contactId: 'month',
        date: now.clone().subtract(2, 'months').toDate(),
      }),
    ]

    const index = buildConversationIndex(
      conversations,
      DEFAULT_STALENESS_BREAKPOINTS
    )

    expect(index.stalenessFor('recent')).toBe('recent')
    expect(index.stalenessFor('week')).toBe('week')
    expect(index.stalenessFor('month')).toBe('month')
    // No conversations recorded → never.
    expect(index.stalenessFor('unknown')).toBe('never')
  })

  it('classifies against custom breakpoints and normalizes inverted ones', () => {
    const conversations: Visit[] = [
      visit({
        contactId: 'a',
        date: moment().subtract(5, 'days').toDate(),
      }),
    ]

    expect(
      buildConversationIndex(conversations, {
        weekDays: 3,
        monthDays: 10,
      }).stalenessFor('a')
    ).toBe('week')
    expect(
      buildConversationIndex(conversations, {
        weekDays: 1,
        monthDays: 4,
      }).stalenessFor('a')
    ).toBe('month')
    // Stale too close to recent: monthDays is raised to weekDays +
    // MIN_STALENESS_GAP_DAYS (3 + 2 = 5), so a 5-day-old conversation sits on
    // the threshold and stays 'week' instead of 'month'.
    expect(
      buildConversationIndex(conversations, {
        weekDays: 3,
        monthDays: 4,
      }).stalenessFor('a')
    ).toBe('week')
    // Inverted thresholds normalize the same way, and a 5-day-old
    // conversation is still within the 7-day recent window.
    expect(
      buildConversationIndex(conversations, {
        weekDays: 7,
        monthDays: 2,
      }).stalenessFor('a')
    ).toBe('recent')
  })

  it('keeps the most recent conversation per contact', () => {
    const older = visit({
      contactId: 'a',
      id: 'older',
      date: moment().subtract(5, 'days').toDate(),
    })
    const newer = visit({
      contactId: 'a',
      id: 'newer',
      date: moment().subtract(1, 'day').toDate(),
    })
    // Intentionally out of order to prove it picks max, not last-seen.
    const index = buildConversationIndex(
      [newer, older],
      DEFAULT_STALENESS_BREAKPOINTS
    )

    expect(index.mostRecentConvByContact.get('a')?.id).toBe('newer')
  })

  it('tracks study flags and current-month studies', () => {
    const conversations: Visit[] = [
      visit({ contactId: 'studiedNow', date: new Date(), isBibleStudy: true }),
      visit({
        contactId: 'studiedBefore',
        date: moment().subtract(3, 'months').toDate(),
        isBibleStudy: true,
      }),
      visit({
        contactId: 'neverStudied',
        date: new Date(),
        isBibleStudy: false,
      }),
    ]

    const index = buildConversationIndex(
      conversations,
      DEFAULT_STALENESS_BREAKPOINTS
    )

    expect(index.studyContactIds.has('studiedNow')).toBe(true)
    expect(index.studyContactIds.has('studiedBefore')).toBe(true)
    expect(index.studyContactIds.has('neverStudied')).toBe(false)

    expect(index.studiedThisMonthIds.has('studiedNow')).toBe(true)
    expect(index.studiedThisMonthIds.has('studiedBefore')).toBe(false)
  })

  it('skips conversations with unparseable dates without throwing', () => {
    const conversations: Visit[] = [
      visit({ contactId: 'bad', date: 'not-a-date' as unknown as Date }),
    ]

    const index = buildConversationIndex(
      conversations,
      DEFAULT_STALENESS_BREAKPOINTS
    )

    expect(index.mostRecentConvMs.has('bad')).toBe(false)
    expect(index.stalenessFor('bad')).toBe('never')
  })
})
