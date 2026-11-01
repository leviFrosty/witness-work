import moment from 'moment'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildConversationIndex } from '@/lib/conversationIndex'
import { DEFAULT_STALENESS_BREAKPOINTS } from '@/constants/staleness'
import { Visit } from '@/types/visit'
import {
  MISSED_FOLLOW_UP_AFTER_HOURS,
  MISSED_FOLLOW_UP_LOOKBACK_DAYS,
  overdueFollowUpConversations,
} from '@/lib/conversations'

const visit = (overrides: Partial<Visit> & { contactId: string }): Visit => ({
  id: overrides.id ?? `${overrides.contactId}-${overrides.date}`,
  contact: { id: overrides.contactId },
  date: overrides.date ?? new Date(),
  isBibleStudy: overrides.isBibleStudy ?? false,
  ...(overrides.followUp ? { followUp: overrides.followUp } : {}),
})

const followUp = (
  date: moment.Moment,
  extra: { dismissed?: boolean } = {}
) => ({
  date: date.toDate(),
  notifyMe: true,
  ...extra,
})

describe('lib/conversationIndex', () => {
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

    expect(
      buildConversationIndex(conversations, {
        weekDays: 3,
        monthDays: 4,
      }).stalenessFor('a')
    ).toBe('week')

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

  it("keeps a shared contact's study as history, not this month's study", () => {
    const received: Visit = {
      ...visit({ contactId: 'shared', date: new Date(), isBibleStudy: true }),
      receivedAt: Date.now(),
    }

    const index = buildConversationIndex(
      [received],
      DEFAULT_STALENESS_BREAKPOINTS
    )

    expect(index.studyContactIds.has('shared')).toBe(true)
    expect(index.mostRecentStudyMs.has('shared')).toBe(true)
    expect(index.studiedThisMonthIds.has('shared')).toBe(false)

    const own = visit({
      contactId: 'shared',
      id: 'own',
      date: new Date(),
      isBibleStudy: true,
    })
    expect(
      buildConversationIndex(
        [received, own],
        DEFAULT_STALENESS_BREAKPOINTS
      ).studiedThisMonthIds.has('shared')
    ).toBe(true)
  })

  it('measures "this month" from the given local day', () => {
    const conversations: Visit[] = [
      visit({
        contactId: 'june',
        date: new Date(2026, 5, 2, 10),
        isBibleStudy: true,
      }),
      visit({
        contactId: 'may',
        date: new Date(2026, 4, 30, 10),
        isBibleStudy: true,
      }),
    ]

    const june = buildConversationIndex(
      conversations,
      DEFAULT_STALENESS_BREAKPOINTS,
      '2026-06-12'
    )
    const may = buildConversationIndex(
      conversations,
      DEFAULT_STALENESS_BREAKPOINTS,
      '2026-05-31'
    )

    expect([...june.studiedThisMonthIds]).toEqual(['june'])
    expect([...may.studiedThisMonthIds]).toEqual(['may'])
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

  describe('follow-ups', () => {
    const now = () => moment()
    const conversations = (): Visit[] => [
      visit({
        id: 'u1',
        contactId: 'upcoming',
        date: now().subtract(4, 'days').toDate(),
        followUp: followUp(now().add(3, 'days')),
      }),

      visit({
        id: 'u0',
        contactId: 'upcoming',
        date: now().subtract(10, 'days').toDate(),
        followUp: followUp(now().add(1, 'day')),
      }),

      visit({
        id: 'd1',
        contactId: 'due',
        date: now().subtract(7, 'days').toDate(),
        followUp: followUp(now().subtract(2, 'hours')),
      }),

      visit({
        id: 'm1',
        contactId: 'missed',
        date: now().subtract(9, 'days').toDate(),
        followUp: followUp(now().subtract(2, 'days')),
      }),

      visit({
        id: 'a1',
        contactId: 'answered',
        date: now().subtract(9, 'days').toDate(),
        followUp: followUp(now().subtract(3, 'days')),
      }),
      visit({
        id: 'a2',
        contactId: 'answered',
        date: now().subtract(1, 'day').toDate(),
      }),

      visit({
        id: 'e1',
        contactId: 'early',
        date: now().subtract(9, 'days').toDate(),
        followUp: followUp(now().subtract(2, 'days')),
      }),
      visit({
        id: 'e2',
        contactId: 'early',
        date: now().subtract(5, 'days').toDate(),
      }),

      visit({
        id: 'o1',
        contactId: 'old',
        date: now()
          .subtract(MISSED_FOLLOW_UP_LOOKBACK_DAYS + 10, 'days')
          .toDate(),
        followUp: followUp(
          now().subtract(MISSED_FOLLOW_UP_LOOKBACK_DAYS + 2, 'days')
        ),
      }),
      visit({
        id: 'x1',
        contactId: 'dismissed',
        date: now().subtract(4, 'days').toDate(),
        followUp: followUp(now().add(2, 'days'), { dismissed: true }),
      }),
      visit({
        id: 'n1',
        contactId: 'none',
        date: now().subtract(4, 'days').toDate(),
      }),
    ]

    it('keeps the soonest open Follow-up that is not missed yet', () => {
      const index = buildConversationIndex(
        conversations(),
        DEFAULT_STALENESS_BREAKPOINTS
      )
      expect([...index.nextFollowUpMs.keys()].sort()).toEqual([
        'due',
        'upcoming',
      ])
      expect(index.nextFollowUpMs.get('upcoming')).toBe(
        now().add(1, 'day').valueOf()
      )
    })

    it('marks the same contacts missed as the missed Follow-up reminders', () => {
      const list = conversations()
      const index = buildConversationIndex(list, DEFAULT_STALENESS_BREAKPOINTS)
      const missed = overdueFollowUpConversations({
        currentTime: new Date(),
        conversations: list,
        lookbackDays: MISSED_FOLLOW_UP_LOOKBACK_DAYS,
      }).map((v) => v.contact.id)
      expect([...index.missedFollowUpMs.keys()].sort()).toEqual(
        [...new Set(missed)].sort()
      )
      expect([...index.missedFollowUpMs.keys()].sort()).toEqual([
        'early',
        'missed',
      ])
      expect(index.missedFollowUpMs.get('missed')).toBe(
        now().subtract(2, 'days').valueOf()
      )
    })

    it('moves a Follow-up from upcoming to missed as the clock passes due + 4h', () => {
      const due = now().add(1, 'hour')
      const list = [
        visit({
          id: 'c1',
          contactId: 'soon',
          date: now().subtract(3, 'days').toDate(),
          followUp: followUp(due),
        }),
      ]
      const missedAt = due.clone().add(MISSED_FOLLOW_UP_AFTER_HOURS, 'hours')

      const before = buildConversationIndex(
        list,
        DEFAULT_STALENESS_BREAKPOINTS,
        undefined,
        missedAt.valueOf() - 1
      )
      expect(before.nextFollowUpMs.get('soon')).toBe(due.valueOf())
      expect(before.missedFollowUpMs.has('soon')).toBe(false)
      expect(before.followUpsChangeAtMs).toBe(missedAt.valueOf())

      const after = buildConversationIndex(
        list,
        DEFAULT_STALENESS_BREAKPOINTS,
        undefined,
        missedAt.valueOf()
      )
      expect(after.nextFollowUpMs.has('soon')).toBe(false)
      expect(after.missedFollowUpMs.has('soon')).toBe(true)
      expect(after.followUpsChangeAtMs).toBeNull()
    })
  })
})
