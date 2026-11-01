import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, opts?: { count?: number }) =>
      opts?.count === undefined ? key : `${key}:${opts.count}`,
  },
}))

import { buildConversationIndex } from '@/lib/conversationIndex'
import { DEFAULT_STALENESS_BREAKPOINTS } from '@/constants/staleness'
import {
  buildSuggestedContacts,
  dueFollowUpLabel,
  followUpDayLabel,
  suggestedRowDetail,
  SUGGESTED_SECTION_LIMIT,
} from '@/lib/suggestedContacts'
import { distanceMeters } from '@/lib/geo'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'

const now = new Date('2026-10-09T12:00:00')
const day = 86_400_000
const here = { latitude: 40.0, longitude: -75.0 }

const north = (meters: number) => ({
  latitude: here.latitude + (meters / 100) * 0.0009,
  longitude: here.longitude,
})

const contact = (id: string, extra: Partial<Contact> = {}): Contact => ({
  id,
  name: id,
  createdAt: new Date('2026-01-01'),
  ...extra,
})

const visit = (
  id: string,
  contactId: string,
  daysAgo: number,
  followUpInDays?: number
): Visit => ({
  id,
  contact: { id: contactId },
  date: new Date(now.getTime() - daysAgo * day),
  isBibleStudy: false,
  ...(followUpInDays === undefined
    ? {}
    : {
        followUp: {
          date: new Date(now.getTime() + followUpInDays * day),
          notifyMe: false,
          topic: 'topic',
        },
      }),
})

const build = (contacts: Contact[], visits: Visit[], withHere = true) =>
  buildSuggestedContacts({
    contacts,
    conversations: visits,
    index: buildConversationIndex(visits, DEFAULT_STALENESS_BREAKPOINTS),
    here: withHere ? here : null,
    currentTime: now,
  })

describe('distanceMeters', () => {
  it('measures about 100 m for 0.0009° of latitude', () => {
    expect(distanceMeters(here, north(100))).toBeGreaterThan(95)
    expect(distanceMeters(here, north(100))).toBeLessThan(105)
  })
})

describe('buildSuggestedContacts', () => {
  it('orders sections Nearby, Follow-ups due, Recent without repeats', () => {
    const contacts = [
      contact('far-recent', { coordinate: north(5000) }),
      contact('near', { coordinate: north(200) }),
      contact('nearest-due', { coordinate: north(20) }),
      contact('due'),
      contact('old'),
    ]
    const visits = [
      visit('v1', 'far-recent', 1),
      visit('v2', 'nearest-due', 10, -2),
      visit('v3', 'due', 20, -3),
      visit('v4', 'old', 60),
    ]
    const result = build(contacts, visits)
    expect(
      result.sections.map((s) => [s.key, s.contacts.map((c) => c.id)])
    ).toEqual([
      ['nearby', ['nearest-due', 'near']],
      ['followUpsDue', ['due']],
      ['recent', ['far-recent']],
    ])
    expect(result.dueFollowUpById.get('nearest-due')?.id).toBe('v2')
    expect(result.suggestedIds.has('old')).toBe(false)
  })

  it('has no Nearby section without a location', () => {
    const result = build(
      [contact('near', { coordinate: north(10) })],
      [visit('v1', 'near', 1)],
      false
    )
    expect(result.sections.map((s) => s.key)).toEqual(['recent'])
  })

  it('skips answered and long-missed Follow-ups', () => {
    const visits = [
      visit('v1', 'answered', 10, -3),
      visit('v2', 'answered', 1),
      visit('v3', 'stale', 60, -45),
      visit('v4', 'later', 2, 3),
    ]
    const result = build(
      [contact('answered'), contact('stale'), contact('later')],
      visits,
      false
    )
    expect(result.dueFollowUpById.size).toBe(0)
  })

  it('caps each section', () => {
    const contacts = Array.from({ length: 8 }, (_, i) =>
      contact(`c${i}`, { coordinate: north(10 + i) })
    )
    const result = build(contacts, [])
    expect(result.sections[0].contacts).toHaveLength(SUGGESTED_SECTION_LIMIT)
  })
})

describe('Been a While', () => {
  const lapsed = (
    contacts: Contact[],
    visits: Visit[],
    dataProtectionMode = false
  ) => {
    const result = buildSuggestedContacts({
      contacts,
      conversations: visits,
      index: buildConversationIndex(visits, DEFAULT_STALENESS_BREAKPOINTS),
      currentTime: now,
      beenAWhile: true,
      dataProtectionMode,
    })
    return {
      result,
      ids:
        result.sections
          .find((s) => s.key === 'beenAWhile')
          ?.contacts.map((c) => c.id) ?? [],
    }
  }
  const notAtHome = (id: string, contactId: string, daysAgo: number) => ({
    ...visit(id, contactId, daysAgo),
    notAtHome: true,
  })

  it('takes a last conversation 21 to 120 days ago', () => {
    const { ids } = lapsed(
      ['d20', 'd21', 'd120', 'd121'].map((id) => contact(id)),
      [
        visit('v1', 'd20', 20),
        visit('v2', 'd21', 21),
        visit('v3', 'd120', 120),
        visit('v4', 'd121', 121),
      ]
    )
    expect(ids).toEqual(['d21', 'd120'])
  })

  it('needs a real conversation, not a Not at Home', () => {
    const { ids } = lapsed(
      [contact('nah-only'), contact('talked-before')],
      [
        notAtHome('v1', 'nah-only', 30),
        visit('v2', 'talked-before', 200),
        notAtHome('v3', 'talked-before', 40),
      ]
    )
    expect(ids).toEqual([])
  })

  it('leaves out someone the User has tried in the last 3 weeks', () => {
    const { ids } = lapsed(
      [contact('tried'), contact('quiet')],
      [
        visit('v1', 'tried', 40),
        notAtHome('v2', 'tried', 18),
        visit('v3', 'quiet', 40),
        notAtHome('v4', 'quiet', 30),
      ]
    )
    expect(ids).toEqual(['quiet'])
  })

  it('leaves out an upcoming Follow-up', () => {
    const { ids } = lapsed(
      [contact('upcoming'), contact('none')],
      [visit('v1', 'upcoming', 30, 5), visit('v2', 'none', 30)]
    )
    expect(ids).toEqual(['none'])
  })

  it('leaves a recently missed Follow-up to Follow-ups Due', () => {
    const { result, ids } = lapsed(
      [contact('missed')],
      [visit('v1', 'missed', 40, -10)]
    )
    expect(result.sections.map((s) => s.key)).toEqual(['followUpsDue'])
    expect(ids).toEqual([])
  })

  it('takes back someone whose Follow-up was missed over 30 days ago', () => {
    const { result, ids } = lapsed(
      [contact('lapsed'), contact('edge')],
      [visit('v1', 'lapsed', 45, -35), visit('v2', 'edge', 45, -30)]
    )
    expect(ids).toEqual(['lapsed'])
    expect(result.dueFollowUpById.has('lapsed')).toBe(false)
    expect(result.dueFollowUpById.has('edge')).toBe(true)
  })

  it('leaves out dismissed Contacts', () => {
    const { ids } = lapsed(
      [
        contact('dismissed', {
          dismissedUntil: new Date(Date.now() + 10 * day),
        }),
        contact('back', { dismissedUntil: new Date(Date.now() - day) }),
      ],
      [visit('v1', 'dismissed', 30), visit('v2', 'back', 30)]
    )
    expect(ids).toEqual(['back'])
  })

  it('puts Bible studies first, then favorites, then most recent', () => {
    const { ids } = lapsed(
      [
        contact('older'),
        contact('newer'),
        contact('favorite', { isFavorite: true }),
        contact('study'),
      ],
      [
        visit('v1', 'older', 90),
        visit('v2', 'newer', 25),
        visit('v3', 'favorite', 100),
        { ...visit('v4', 'study', 110), isBibleStudy: true },
      ]
    )
    expect(ids).toEqual(['study', 'favorite', 'newer', 'older'])
  })

  it('caps the section and skips Contacts in earlier sections', () => {
    const contacts = Array.from({ length: 8 }, (_, i) => contact(`c${i}`))
    const visits = contacts.map((c, i) => visit(`v${i}`, c.id, 30 + i))
    visits.push(visit('due', 'c0', 40, 0))
    const { result, ids } = lapsed(contacts, visits)
    expect(result.sections.map((s) => s.key)).toEqual([
      'followUpsDue',
      'beenAWhile',
    ])
    expect(ids).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
    expect(ids).toHaveLength(SUGGESTED_SECTION_LIMIT)
  })

  it('stops at 90 days in data protection mode', () => {
    const contacts = [contact('d90'), contact('d91')]
    const visits = [visit('v1', 'd90', 90), visit('v2', 'd91', 91)]
    expect(lapsed(contacts, visits, true).ids).toEqual(['d90'])
    expect(lapsed(contacts, visits).ids).toEqual(['d90', 'd91'])
  })

  it('is off unless asked for', () => {
    const result = build([contact('a')], [visit('v1', 'a', 30)], false)
    expect(result.sections).toEqual([])
  })

  it('says when they last talked, not the later Not at Home', () => {
    const { result } = lapsed(
      [contact('a')],
      [visit('talk', 'a', 60), notAtHome('nah', 'a', 25)]
    )
    expect(result.lastTalkById.get('a')?.id).toBe('talk')
    expect(
      suggestedRowDetail('beenAWhile', contact('a'), result, now)?.text
    ).toBe('suggested_lastTalked')
  })
})

describe('dueFollowUpLabel', () => {
  it('says today, or how many days overdue', () => {
    expect(dueFollowUpLabel(visit('a', 'c', 5, 0), now)).toBe(
      'suggested_followUpToday'
    )
    expect(dueFollowUpLabel(visit('b', 'c', 5, -2), now)).toBe(
      'suggested_followUpOverdue:2'
    )
  })
})

describe('followUpDayLabel', () => {
  it('counts calendar days to an upcoming Follow-up', () => {
    expect(followUpDayLabel(new Date('2026-10-09T23:00:00'), now)).toBe(
      'suggested_followUpToday'
    )
    expect(followUpDayLabel(new Date('2026-10-10T08:00:00'), now)).toBe(
      'contacts_sortDetail_followUpTomorrow'
    )
    expect(
      followUpDayLabel(new Date('2026-10-14T08:00:00').getTime(), now)
    ).toBe('contacts_sortDetail_followUpInDays:5')
  })

  it('counts calendar days past a missed Follow-up', () => {
    expect(followUpDayLabel(new Date('2026-10-08T23:00:00'), now)).toBe(
      'suggested_followUpOverdue:1'
    )
  })
})
