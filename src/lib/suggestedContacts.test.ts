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
  SUGGESTED_SECTION_LIMIT,
} from '@/lib/suggestedContacts'
import { distanceMeters } from '@/lib/geo'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'

const now = new Date('2026-10-09T12:00:00')
const day = 86_400_000
const here = { latitude: 40.0, longitude: -75.0 }
// ~0.0009° latitude ≈ 100 m.
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
