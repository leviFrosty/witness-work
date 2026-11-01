import moment from 'moment'
import { createFakeContact } from '@/__tests__/__data__/contacts'
import {
  contactHasAtLeastOneStudy,
  contactLastConversation,
  contactMostRecentStudy,
  contactStudiedForGivenMonth,
  followUpAnswer,
  followUpCardItems,
  isAppointment,
  isOwnVisit,
  isPlaceholderFollowUp,
  newVisitIsBibleStudy,
  overdueFollowUpConversations,
  plannedFollowUpTopic,
  stripPlaceholderFollowUp,
} from '@/lib/conversations'
import { Visit } from '@/types/visit'
import { describe, expect, it } from 'vitest'

const testDate = moment({ year: 2023, month: 10 }).toDate()
const contact = createFakeContact()

const baseVisit = (overrides: Partial<Visit> = {}): Visit => ({
  id: 'v1',
  contact: { id: contact.id },
  date: new Date(),
  isBibleStudy: false,
  ...overrides,
})

describe('lib/conversations', () => {
  describe('isAppointment', () => {
    it('is false without a follow-up', () => {
      expect(isAppointment(baseVisit())).toBe(false)
    })

    it('is true for any attached follow-up, even without reminder or topic', () => {
      const visit = baseVisit({
        followUp: { date: new Date(), notifyMe: false },
      })
      expect(isAppointment(visit)).toBe(true)
    })

    it('is false once the follow-up is dismissed', () => {
      const visit = baseVisit({
        followUp: {
          date: new Date(),
          notifyMe: true,
          topic: 'Ch. 1',
          dismissed: true,
        },
      })
      expect(isAppointment(visit)).toBe(false)
    })
  })

  describe('isPlaceholderFollowUp / stripPlaceholderFollowUp', () => {
    it('treats a follow-up with no reminder and no topic as a placeholder', () => {
      expect(isPlaceholderFollowUp({ date: new Date(), notifyMe: false })).toBe(
        true
      )
      expect(
        isPlaceholderFollowUp({ date: new Date(), notifyMe: false, topic: '' })
      ).toBe(true)
    })

    it('keeps follow-ups that carry intent', () => {
      expect(isPlaceholderFollowUp({ date: new Date(), notifyMe: true })).toBe(
        false
      )
      expect(
        isPlaceholderFollowUp({ date: new Date(), notifyMe: false, topic: 'x' })
      ).toBe(false)
      expect(isPlaceholderFollowUp(undefined)).toBe(false)
    })

    it('strips a placeholder and returns a new record', () => {
      const visit = baseVisit({
        note: 'hi',
        followUp: { date: new Date(), notifyMe: false },
      })
      const stripped = stripPlaceholderFollowUp(visit)
      expect(stripped).not.toBe(visit)
      expect(stripped.followUp).toBeUndefined()
      expect('followUp' in stripped).toBe(false)
      expect(stripped.note).toBe('hi')
    })

    it('returns the same instance when nothing needs stripping', () => {
      const withIntent = baseVisit({
        followUp: { date: new Date(), notifyMe: true },
      })
      expect(stripPlaceholderFollowUp(withIntent)).toBe(withIntent)
      const none = baseVisit()
      expect(stripPlaceholderFollowUp(none)).toBe(none)
    })
  })

  describe('overdueFollowUpConversations', () => {
    const now = moment('2026-09-20T12:00:00').toDate()

    it('includes a plain follow-up whose date has passed', () => {
      const visit = baseVisit({
        date: moment(now).subtract(3, 'days').toDate(),
        followUp: {
          date: moment(now).subtract(1, 'day').toDate(),
          notifyMe: false,
        },
      })
      expect(
        overdueFollowUpConversations({
          currentTime: now,
          conversations: [visit],
          lookbackDays: 30,
        })
      ).toEqual([visit])
    })

    it('excludes visits without a follow-up and dismissed follow-ups', () => {
      const none = baseVisit({
        id: 'a',
        date: moment(now).subtract(3, 'days').toDate(),
      })
      const dismissed = baseVisit({
        id: 'b',
        date: moment(now).subtract(3, 'days').toDate(),
        followUp: {
          date: moment(now).subtract(1, 'day').toDate(),
          notifyMe: true,
          dismissed: true,
        },
      })
      expect(
        overdueFollowUpConversations({
          currentTime: now,
          conversations: [none, dismissed],
          lookbackDays: 30,
        })
      ).toEqual([])
    })

    it('excludes a follow-up answered by a Visit earlier that day', () => {
      const visit = baseVisit({
        id: 'a',
        date: moment(now).subtract(3, 'days').toDate(),
        followUp: {
          date: moment(now).subtract(1, 'day').hour(14).toDate(),
          notifyMe: false,
        },
      })
      const early = baseVisit({
        id: 'b',
        date: moment(now).subtract(1, 'day').hour(13).toDate(),
        notAtHome: true,
      })
      expect(
        overdueFollowUpConversations({
          currentTime: now,
          conversations: [visit, early],
          lookbackDays: 30,
        })
      ).toEqual([])
    })
  })

  describe('contactStudiedForGivenMonth ', () => {
    it('should return false if no studies', () => {
      const conversations: Visit[] = []

      const studied = contactStudiedForGivenMonth({
        contact,
        conversations,
        month: testDate,
      })
      expect(studied).toBe(false)
    })

    it('should return false if studied in previous months', () => {
      const conversations: Visit[] = [
        {
          contact: {
            id: contact.id,
          },
          date: moment(testDate).subtract(1, 'month').toDate(),
          id: '1',
          isBibleStudy: true,
        },
      ]

      const studied = contactStudiedForGivenMonth({
        contact,
        conversations,
        month: testDate,
      })
      expect(studied).toBe(false)
    })

    it('should return true if studied this month', () => {
      const conversations: Visit[] = [
        {
          contact: {
            id: contact.id,
          },
          date: testDate,
          id: '1',
          isBibleStudy: true,
        },
      ]

      const studied = contactStudiedForGivenMonth({
        contact,
        conversations,
        month: testDate,
      })
      expect(studied).toBe(true)
    })

    it("doesn't count a study that came with a shared contact", () => {
      const received = baseVisit({
        date: testDate,
        isBibleStudy: true,
        receivedAt: 1,
      })
      expect(
        contactStudiedForGivenMonth({
          contact,
          conversations: [received],
          month: testDate,
        })
      ).toBe(false)

      expect(
        contactStudiedForGivenMonth({
          contact,
          conversations: [
            received,
            baseVisit({ id: 'v2', date: testDate, isBibleStudy: true }),
          ],
          month: testDate,
        })
      ).toBe(true)
    })
  })

  describe('isOwnVisit', () => {
    it('is false only for a Visit that came with a shared contact', () => {
      expect(isOwnVisit(baseVisit())).toBe(true)
      expect(isOwnVisit(baseVisit({ receivedAt: 1_700_000_000_000 }))).toBe(
        false
      )
    })
  })

  describe('contactHasAtLeastOneStudy', () => {
    it('returns true if contact has had a study at any point in time', () => {
      const conversations: Visit[] = [
        {
          contact: {
            id: contact.id,
          },
          date: testDate,
          id: '1',
          isBibleStudy: true,
        },
      ]

      const hasEverStudied = contactHasAtLeastOneStudy({
        contact,
        conversations,
      })

      expect(hasEverStudied).toBe(true)
    })

    it('returns false if contact has not ever had a study', () => {
      const conversations: Visit[] = []

      const hasEverStudied = contactHasAtLeastOneStudy({
        contact,
        conversations,
      })

      expect(hasEverStudied).toBe(false)
    })
  })

  describe('contactMostRecentStudy', () => {
    it('should not return null if there is no studies for contact', () => {
      const conversations: Visit[] = []

      const mostRecentStudy = contactMostRecentStudy({
        contact,
        conversations,
      })

      expect(mostRecentStudy).toBe(null)
    })

    it('should return the most recent study', () => {
      const conversations: Visit[] = [
        {
          contact: {
            id: contact.id,
          },
          date: testDate,
          id: '1',
          isBibleStudy: true,
        },
        {
          contact: {
            id: contact.id,
          },
          date: moment(testDate).subtract(1, 'day').toDate(),
          id: '2',
          isBibleStudy: true,
        },
        {
          contact: {
            id: contact.id,
          },
          date: moment(testDate).subtract(1, 'year').toDate(),
          id: '3',
          isBibleStudy: true,
        },
      ]

      const mostRecentStudy = contactMostRecentStudy({
        contact,
        conversations,
      })

      expect(mostRecentStudy).toBe(conversations[0])
    })

    it('should return the most recent study not sorted', () => {
      const conversations: Visit[] = [
        {
          contact: {
            id: contact.id,
          },
          date: moment(testDate).subtract(1, 'day').toDate(),
          id: '2',
          isBibleStudy: true,
        },
        {
          contact: {
            id: contact.id,
          },
          date: testDate,
          id: '1',
          isBibleStudy: true,
        },
        {
          contact: {
            id: contact.id,
          },
          date: moment(testDate).subtract(1, 'year').toDate(),
          id: '3',
          isBibleStudy: true,
        },
      ]

      const mostRecentStudy = contactMostRecentStudy({
        contact,
        conversations,
      })

      expect(mostRecentStudy).toBe(conversations[1])
    })
  })

  describe('followUpAnswer', () => {
    const followUpAt = moment('2026-09-20T14:30:00').toDate()
    const source = baseVisit({
      id: 'source',
      date: moment('2026-09-13T10:00:00').toDate(),
      followUp: { date: followUpAt, notifyMe: true },
    })

    it('is the earliest later Visit on the Follow-up day or after', () => {
      const early = baseVisit({
        id: 'early',
        date: moment('2026-09-20T14:00:00').toDate(),
        notAtHome: true,
      })
      const later = baseVisit({
        id: 'later',
        date: moment('2026-09-21T10:00:00').toDate(),
      })
      expect(followUpAnswer(source, [source, later, early])).toBe(early)
    })

    it('ignores Visits before the Follow-up day', () => {
      const dayBefore = baseVisit({
        id: 'before',
        date: moment('2026-09-19T18:00:00').toDate(),
      })
      expect(followUpAnswer(source, [source, dayBefore])).toBeUndefined()
    })

    it('ignores Visits not after the one that set the Follow-up', () => {
      const sameDay = baseVisit({
        id: 'sameDaySource',
        date: moment('2026-09-20T10:00:00').toDate(),
        followUp: { date: followUpAt, notifyMe: true },
      })
      const earlier = baseVisit({
        id: 'earlier',
        date: moment('2026-09-20T09:00:00').toDate(),
      })
      expect(followUpAnswer(sameDay, [sameDay, earlier])).toBeUndefined()
    })
  })

  describe('followUpCardItems', () => {
    const day = moment('2026-09-20T00:00:00')
    const at = (hour: number, dayOffset = 0) =>
      day.clone().add(dayOffset, 'days').hour(hour).toDate()
    const followUp = (id: string, contactId: string, date: Date): Visit => ({
      id,
      contact: { id: contactId },
      date: moment(date).subtract(7, 'days').toDate(),
      isBibleStudy: false,
      followUp: { date, notifyMe: true },
    })
    const visit = (id: string, contactId: string, date: Date): Visit => ({
      id,
      contact: { id: contactId },
      date,
      isBibleStudy: false,
    })

    const morning = followUp('morning', 'a', at(9))
    const noon = followUp('noon', 'b', at(12))
    const evening = followUp('evening', 'c', at(19))
    const tomorrow = followUp('tomorrow', 'd', at(10, 1))
    const yesterday = followUp('yesterday', 'e', at(10, -1))
    const answer = visit('answer', 'a', at(9))
    const all = [tomorrow, evening, noon, morning, yesterday, answer]

    it("lists today's Follow-ups in time order, with their answers", () => {
      const items = followUpCardItems({
        currentTime: at(11),
        conversations: all,
      })
      expect(items).toEqual([
        { visit: morning, answeredBy: answer },
        { visit: noon, answeredBy: undefined },
        { visit: evening, answeredBy: undefined },
      ])
    })

    it('drops open Follow-ups once missed but keeps answered ones', () => {
      const items = followUpCardItems({
        currentTime: moment(at(16)).add(30, 'minutes').toDate(),
        conversations: all,
      })
      expect(items.map((i) => i.visit.id)).toEqual(['morning', 'evening'])
    })

    it("adds tomorrow's Follow-ups from 5 PM", () => {
      const items = followUpCardItems({
        currentTime: at(17),
        conversations: all,
      })
      expect(items.map((i) => i.visit.id)).toEqual([
        'morning',
        'evening',
        'tomorrow',
      ])
    })

    it('skips dismissed Follow-ups', () => {
      const dismissed: Visit = {
        ...noon,
        followUp: { ...noon.followUp!, dismissed: true },
      }
      const items = followUpCardItems({
        currentTime: at(11),
        conversations: [dismissed],
      })
      expect(items).toEqual([])
    })
  })

  describe('Follow-up scans over a long history', () => {
    const now = moment('2026-09-20T17:30:00')
    let seed = 7
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const history: Visit[] = Array.from({ length: 600 }, (_, i) => {
      const date = now
        .clone()
        .subtract(Math.floor(random() * 90 * 24 * 60), 'minutes')
      const followUpAt = date
        .clone()
        .add(Math.floor(random() * 45 * 24 * 60), 'minutes')
      const shape = i % 4
      return {
        id: `v${i}`,
        contact: { id: `c${i % 300}` },
        date: date.toDate(),
        isBibleStudy: false,
        ...(shape === 3
          ? {}
          : {
              followUp: {
                date: (shape === 0
                  ? followUpAt.toDate()
                  : shape === 1
                    ? followUpAt.toISOString()
                    : followUpAt.format('YYYY-MM-DD')) as unknown as Date,
                notifyMe: true,
                dismissed: i % 11 === 0,
              },
            }),
      }
    })

    const fullScanOverdue = (currentTime: Date) => {
      const max = moment(currentTime).subtract(4, 'hours')
      const min = moment(currentTime).subtract(30, 'days').startOf('day')
      return history.filter((visit) => {
        if (!isAppointment(visit)) return false
        if (!moment(visit.followUp!.date).isBetween(min, max, undefined, '[]'))
          return false
        const others = history.filter((v) => v.contact.id === visit.contact.id)
        return !followUpAnswer(visit, others)
      })
    }

    const fullScanCard = (currentTime: Date) => {
      const at = moment(currentTime)
      const isMorning = at.isBefore(at.clone().endOf('day').hour(16))
      const min = at.clone().startOf('day')
      const max = isMorning
        ? at.clone().endOf('day')
        : at.clone().add(1, 'day').endOf('day')
      const missedBefore = at.clone().subtract(4, 'hours')
      return history.flatMap((visit) => {
        if (!isAppointment(visit)) return []
        const date = moment(visit.followUp!.date)
        if (!date.isBetween(min, max, undefined, '[]')) return []
        const others = history.filter((v) => v.contact.id === visit.contact.id)
        const answeredBy = followUpAnswer(visit, others)
        if (!answeredBy && date.isBefore(missedBefore)) return []
        return [{ visit, answeredBy }]
      })
    }

    const times = [
      now.toDate(),
      now.clone().hour(9).toDate(),
      now.clone().startOf('day').toDate(),
      now.clone().subtract(25, 'days').hour(23).toDate(),
    ]

    it('finds the same missed Follow-ups as a full scan', () => {
      for (const currentTime of times) {
        const expected = fullScanOverdue(currentTime)
        expect(expected.length).toBeGreaterThan(0)
        expect(
          overdueFollowUpConversations({
            currentTime,
            conversations: history,
            lookbackDays: 30,
          })
        ).toEqual(expected)
      }
    })

    it('lists the same card items as a full scan', () => {
      for (const currentTime of times) {
        const expected = fullScanCard(currentTime)
        expect(expected.length).toBeGreaterThan(0)
        const items = followUpCardItems({ currentTime, conversations: history })
        expect(new Set(items.map((i) => i.visit.id))).toEqual(
          new Set(expected.map((i) => i.visit.id))
        )
        for (const item of items)
          expect(item.answeredBy).toBe(
            expected.find((e) => e.visit === item.visit)!.answeredBy
          )
      }
    })
  })

  describe('new visit defaults', () => {
    const now = new Date('2026-10-19T12:00:00')
    const daysAgo = (days: number) =>
      moment(now).subtract(days, 'days').toDate()

    it('picks the latest real conversation, skipping Not at Home', () => {
      const conversations = [
        baseVisit({ id: 'old', date: daysAgo(14) }),
        baseVisit({ id: 'recent', date: daysAgo(7) }),
        baseVisit({ id: 'nah', date: daysAgo(1), notAtHome: true }),
        baseVisit({ id: 'other', date: daysAgo(1), contact: { id: 'x' } }),
        baseVisit({ id: 'future', date: moment(now).add(1, 'day').toDate() }),
      ]
      expect(
        contactLastConversation({
          conversations,
          contactId: contact.id,
          before: now,
        })?.id
      ).toBe('recent')
    })

    it('starts on when the last real conversation was a Bible Study', () => {
      const conversations = [
        baseVisit({ id: 'study', date: daysAgo(7), isBibleStudy: true }),
        baseVisit({ id: 'nah', date: daysAgo(1), notAtHome: true }),
      ]
      expect(
        newVisitIsBibleStudy({
          conversations,
          contactId: contact.id,
          date: now,
        })
      ).toBe(true)
    })

    it('starts off when the last real conversation was not a study', () => {
      const conversations = [
        baseVisit({ id: 'study', date: daysAgo(14), isBibleStudy: true }),
        baseVisit({ id: 'talk', date: daysAgo(7), isBibleStudy: false }),
      ]
      expect(
        newVisitIsBibleStudy({
          conversations,
          contactId: contact.id,
          date: now,
        })
      ).toBe(false)
    })

    it('starts off for Not at Home, a new contact, or no contact', () => {
      const conversations = [
        baseVisit({ id: 'study', date: daysAgo(7), isBibleStudy: true }),
      ]
      expect(
        newVisitIsBibleStudy({
          conversations,
          contactId: contact.id,
          date: now,
          notAtHome: true,
        })
      ).toBe(false)
      expect(
        newVisitIsBibleStudy({ conversations, contactId: 'new', date: now })
      ).toBe(false)
      expect(
        newVisitIsBibleStudy({ conversations, contactId: '', date: now })
      ).toBe(false)
    })

    it("shows the answered Follow-up's planned topic", () => {
      const conversations = [
        baseVisit({
          id: 'planned',
          followUp: { date: now, notifyMe: false, topic: '  Lesson 3 ' },
        }),
        baseVisit({
          id: 'blank',
          followUp: { date: now, notifyMe: false, topic: '   ' },
        }),
      ]
      expect(
        plannedFollowUpTopic({ conversations, followUpVisitId: 'planned' })
      ).toBe('Lesson 3')
      expect(
        plannedFollowUpTopic({ conversations, followUpVisitId: 'blank' })
      ).toBeUndefined()
      expect(
        plannedFollowUpTopic({ conversations, followUpVisitId: 'missing' })
      ).toBeUndefined()
      expect(plannedFollowUpTopic({ conversations })).toBeUndefined()
    })
  })
})
