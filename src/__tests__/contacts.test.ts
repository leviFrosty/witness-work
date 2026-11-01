import moment from 'moment'
import {
  getStudiesForGivenMonth,
  getStudyContactsForGivenMonth,
} from '@/lib/contacts'
import { contactStudiedForGivenMonth } from '@/lib/conversations'
import { createFakeContacts } from '@/__tests__/__data__/contacts'
import { Visit } from '@/types/visit'
import { describe, expect, it } from 'vitest'

const testDate = moment({ year: 2023, month: 10 }).toDate()

const fiveContacts = () => {
  const [first] = createFakeContacts()
  return Array.from({ length: 5 }, (_, i) => ({ ...first, id: `contact-${i}` }))
}

describe('lib/contacts', () => {
  describe('getStudiesForGivenMonth', () => {
    it('returns 0 studies if 0 conversations', () => {
      const contacts = createFakeContacts()
      const conversations: Visit[] = []

      const count = getStudiesForGivenMonth({
        contacts,
        conversations,
        month: testDate,
      })
      expect(count).toBe(0)
    })

    it('returns 1 study if a contact has a single corresponding study', () => {
      const contacts = createFakeContacts()
      const conversations: Visit[] = [
        {
          contact: {
            id: contacts[0].id,
          },
          date: testDate,
          id: '1',
          isBibleStudy: true,
        },
      ]

      const count = getStudiesForGivenMonth({
        contacts,
        conversations,
        month: testDate,
      })

      expect(count).toBe(1)
    })

    it('returns 1 study if a contact has multiple corresponding study', () => {
      const contacts = createFakeContacts()
      const conversations: Visit[] = [
        {
          contact: {
            id: contacts[0].id,
          },
          date: testDate,
          id: '1',
          isBibleStudy: true,
        },
        {
          contact: {
            id: contacts[0].id,
          },
          date: testDate,
          id: '2',
          isBibleStudy: true,
        },
      ]

      const count = getStudiesForGivenMonth({
        contacts,
        conversations,
        month: testDate,
      })

      expect(count).toBe(1)
    })

    it('returns 0 studies if a contact has multiple studies that do not match the current month', () => {
      const contacts = createFakeContacts()
      const conversations: Visit[] = [
        {
          contact: {
            id: contacts[0].id,
          },
          date: moment(testDate).subtract(1, 'month').toDate(),
          id: '1',
          isBibleStudy: true,
        },
        {
          contact: {
            id: contacts[0].id,
          },
          date: moment(testDate).subtract(1, 'month').toDate(),
          id: '2',
          isBibleStudy: true,
        },
        {
          contact: {
            id: contacts[0].id,
          },
          date: moment(testDate).subtract(1, 'year').toDate(),
          id: '3',
          isBibleStudy: true,
        },
      ]

      const count = getStudiesForGivenMonth({
        contacts,
        conversations,
        month: testDate,
      })

      expect(count).toBe(0)
    })

    it('returns multiple studies if there are multiple contacts with multiple studies within the current month', () => {
      const contacts = createFakeContacts()
      const conversations: Visit[] = [
        {
          contact: {
            id: contacts[0].id,
          },
          date: testDate,
          id: '1',
          isBibleStudy: true,
        },
        {
          contact: {
            id: contacts[1].id,
          },
          date: testDate,
          id: '2',
          isBibleStudy: true,
        },
      ]

      const count = getStudiesForGivenMonth({
        contacts,
        conversations,
        month: testDate,
      })

      expect(count).toBe(2)
    })
  })

  describe('getStudyContactsForGivenMonth', () => {
    it('returns each studied Contact once, skipping orphaned Conversations', () => {
      const contacts = createFakeContacts()
      contacts[0].dismissedUntil = moment(testDate).add(1, 'month').toDate()
      const conversations: Visit[] = [
        {
          contact: { id: contacts[0].id },
          date: testDate,
          id: '1',
          isBibleStudy: true,
        },
        {
          contact: { id: contacts[0].id },
          date: testDate,
          id: '2',
          isBibleStudy: true,
        },
        {
          contact: { id: contacts[1].id },
          date: testDate,
          id: '3',
          isBibleStudy: true,
        },
        {
          contact: { id: 'orphaned-contact' },
          date: testDate,
          id: '4',
          isBibleStudy: true,
        },
      ]

      const studyContacts = getStudyContactsForGivenMonth({
        contacts,
        conversations,
        month: testDate,
      })

      expect(studyContacts.map((contact) => contact.id)).toEqual([
        contacts[0].id,
        contacts[1].id,
      ])
    })

    it("leaves out other months, other Visits and a shared Contact's studies", () => {
      const contacts = fiveContacts()
      const conversations: Visit[] = [
        {
          contact: { id: contacts[0].id },
          date: moment(testDate).subtract(1, 'day').toDate(),
          id: '1',
          isBibleStudy: true,
        },
        {
          contact: { id: contacts[1].id },
          date: moment(testDate).endOf('month').add(1, 'ms').toDate(),
          id: '2',
          isBibleStudy: true,
        },
        {
          contact: { id: contacts[2].id },
          date: testDate,
          id: '3',
          isBibleStudy: true,
          receivedAt: testDate.getTime(),
        },
        {
          contact: { id: contacts[3].id },
          date: testDate,
          id: '4',
          isBibleStudy: false,
        },
        {
          contact: { id: contacts[4].id },
          date: moment(testDate).endOf('month').toISOString(),
          id: '5',
          isBibleStudy: true,
        } as unknown as Visit,
      ]

      expect(
        getStudyContactsForGivenMonth({
          contacts,
          conversations,
          month: testDate,
        }).map((contact) => contact.id)
      ).toEqual([contacts[4].id])
    })

    it('agrees with checking each Contact on its own', () => {
      const contacts = fiveContacts()
      const conversations: Visit[] = Array.from({ length: 200 }, (_, i) => ({
        contact: { id: contacts[(i * 7) % contacts.length].id },
        date: moment(testDate)
          .add((i % 90) - 45, 'days')
          .toDate(),
        id: `v${i}`,
        isBibleStudy: i % 3 === 0,
        ...(i % 11 === 0 ? { receivedAt: 1 } : {}),
      }))

      expect(
        getStudyContactsForGivenMonth({
          contacts,
          conversations,
          month: testDate,
        })
      ).toEqual(
        contacts.filter((contact) =>
          contactStudiedForGivenMonth({
            contact,
            conversations,
            month: testDate,
          })
        )
      )
    })
  })
})
