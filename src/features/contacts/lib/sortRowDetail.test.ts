import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${Object.values(opts).join(',')}` : key,
  },
}))
vi.mock('@/lib/dates', () => ({
  formatRelative: (input: Date | number) =>
    `rel(${new Date(input).toISOString().slice(0, 10)})`,
}))

import { buildConversationIndex } from '@/lib/conversationIndex'
import { DEFAULT_STALENESS_BREAKPOINTS } from '@/constants/staleness'
import type { ContactSortKey } from '@/lib/contactsSort'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import { sortRowDetail } from '@/features/contacts/lib/sortRowDetail'

const now = new Date('2026-10-09T12:00:00')
const day = 86_400_000

const contact = (id: string, extra: Partial<Contact> = {}): Contact => ({
  id,
  name: id,
  createdAt: new Date('2026-01-01T12:00:00Z'),
  ...extra,
})

const visit = (
  contactId: string,
  daysAgo: number,
  extra: { followUpInDays?: number; isBibleStudy?: boolean } = {}
): Visit => ({
  id: `${contactId}-${daysAgo}`,
  contact: { id: contactId },
  date: new Date(now.getTime() - daysAgo * day),
  isBibleStudy: !!extra.isBibleStudy,
  ...(extra.followUpInDays === undefined
    ? {}
    : {
        followUp: {
          date: new Date(now.getTime() + extra.followUpInDays * day),
          notifyMe: false,
          topic: 'topic',
        },
      }),
})

const detailFor = (
  sort: ContactSortKey,
  target: Contact,
  visits: Visit[] = [],
  sortLabel = 'Sort label'
) =>
  sortRowDetail({
    sort,
    sortLabel,
    contact: target,
    index: buildConversationIndex(
      visits,
      DEFAULT_STALENESS_BREAKPOINTS,
      undefined,
      now.getTime()
    ),
    currentTime: now,
  })

describe('sortRowDetail', () => {
  it('keeps the last-visit line for sorts that already show their value', () => {
    const visits = [visit('a', 2, { followUpInDays: 3 })]
    for (const sort of [
      'suggested',
      'recentConversation',
      'pinStaleness',
      'az',
      'za',
    ] as const) {
      expect(detailFor(sort, contact('a'), visits)).toBeUndefined()
    }
  })

  describe('next follow-up', () => {
    it('says how far away an upcoming follow-up is', () => {
      expect(
        detailFor('nextFollowUp', contact('a'), [
          visit('a', 2, { followUpInDays: 3 }),
        ])
      ).toEqual({
        text: 'contacts_sortDetail_followUpInDays:3',
        tone: 'default',
      })
      expect(
        detailFor('nextFollowUp', contact('a'), [
          visit('a', 2, { followUpInDays: 1 }),
        ])
      ).toEqual({
        text: 'contacts_sortDetail_followUpTomorrow',
        tone: 'default',
      })
    })

    it('marks a follow-up due today as due', () => {
      expect(
        detailFor('nextFollowUp', contact('a'), [
          visit('a', 2, { followUpInDays: 0.1 }),
        ])
      ).toEqual({ text: 'suggested_followUpToday', tone: 'due' })
    })

    it('says how overdue a missed follow-up is', () => {
      expect(
        detailFor('nextFollowUp', contact('a'), [
          visit('a', 9, { followUpInDays: -3 }),
        ])
      ).toEqual({ text: 'suggested_followUpOverdue:3', tone: 'due' })
    })

    it('says when no follow-up is planned', () => {
      const none = { text: 'contacts_sortDetail_noFollowUp' }
      expect(detailFor('nextFollowUp', contact('a'))).toEqual(none)

      expect(
        detailFor('nextFollowUp', contact('a'), [
          visit('a', 9, { followUpInDays: -3 }),
          visit('a', 1),
        ])
      ).toEqual(none)

      expect(
        detailFor('nextFollowUp', contact('a'), [
          visit('a', 60, { followUpInDays: -45 }),
        ])
      ).toEqual(none)
    })
  })

  it('shows the last study, or that there is none', () => {
    expect(
      detailFor('bibleStudy', contact('a'), [
        visit('a', 2, { isBibleStudy: true }),
        visit('a', 1),
      ])
    ).toEqual({ text: 'contacts_sortDetail_studied:rel(2026-10-07)' })
    expect(detailFor('bibleStudy', contact('a'), [visit('a', 1)])).toEqual({
      text: 'contacts_sortDetail_noStudy',
    })
  })

  it('shows when the contact was added', () => {
    expect(detailFor('createdAt', contact('a'))).toEqual({
      text: 'contacts_sortDetail_added:rel(2026-01-01)',
    })
  })

  it('shows the sorted address field, or that it is not set', () => {
    const springfield = contact('a', {
      address: { city: 'Springfield', state: 'IL', zip: ' ' },
    })
    expect(detailFor('city', springfield)).toEqual({ text: 'Springfield' })
    expect(detailFor('state', springfield)).toEqual({ text: 'IL' })
    expect(detailFor('zip', springfield, [], 'Zip / Postal code')).toEqual({
      text: 'contacts_sortDetail_notSet:Zip / Postal code',
    })
  })

  it('shows the sorted custom field, or that it is not set', () => {
    expect(
      detailFor(
        'customField:def-1',
        contact('a', { customFields: { 'def-1': '2026-11-02' } })
      )
    ).toEqual({ text: '2026-11-02' })
    expect(
      detailFor('customField:def-1', contact('a'), [], 'Return date')
    ).toEqual({
      text: 'contacts_sortDetail_notSet:Return date',
    })
  })
})
