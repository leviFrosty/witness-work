import moment from 'moment'
import { createFakeContact } from '@/__tests__/__data__/contacts'
import {
  contactHasAtLeastOneStudy,
  contactMostRecentStudy,
  contactStudiedForGivenMonth,
  followUpAnswer,
  followUpCardItems,
  isAppointment,
  isPlaceholderFollowUp,
  overdueFollowUpConversations,
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
})
