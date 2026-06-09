import moment from 'moment'
import { describe, expect, it } from 'vitest'
import { buildConversationIndex } from '@/lib/conversationIndex'
import { Visit } from '@/types/visit'

const visit = (overrides: Partial<Visit> & { contactId: string }): Visit => ({
  id: overrides.id ?? `${overrides.contactId}-${overrides.date}`,
  contact: { id: overrides.contactId },
  date: overrides.date ?? new Date(),
  isBibleStudy: overrides.isBibleStudy ?? false,
})

describe('lib/conversationIndex', () => {
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

    const index = buildConversationIndex(conversations)

    expect(index.stalenessFor('recent')).toBe('recent')
    expect(index.stalenessFor('week')).toBe('week')
    expect(index.stalenessFor('month')).toBe('month')
    // No conversations recorded → never.
    expect(index.stalenessFor('unknown')).toBe('never')
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
    const index = buildConversationIndex([newer, older])

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

    const index = buildConversationIndex(conversations)

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

    const index = buildConversationIndex(conversations)

    expect(index.mostRecentConvMs.has('bad')).toBe(false)
    expect(index.stalenessFor('bad')).toBe('never')
  })
})
