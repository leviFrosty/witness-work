import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  return { default: i18n }
})
import moment from 'moment'
import type { ConversationIndex } from '@/lib/conversationIndex'
import type { CustomFieldDefinition } from '@/types/customField'
import {
  contactCardLine,
  contactPinFacts,
  contactUrgency,
  followUpState,
  groupAccessibilityLabel,
  groupTitle,
  pinBadge,
  pinInitials,
  resolveCardDetail,
} from '@/features/map/lib/contactPins'

const NOW = moment('2026-10-21T10:00:00').valueOf()
const at = (iso: string) => moment(iso).valueOf()

const index = (parts: Partial<ConversationIndex> = {}): ConversationIndex => ({
  mostRecentConvMs: new Map(),
  mostRecentConvByContact: new Map(),
  mostRecentStudyMs: new Map(),
  studyContactIds: new Set(),
  studiedThisMonthIds: new Set(),
  nextFollowUpMs: new Map(),
  missedFollowUpMs: new Map(),
  followUpsChangeAtMs: null,
  nowMs: NOW,
  stalenessFor: () => 'never',
  stalenessRankFor: () => 0,
  ...parts,
})

describe('contactCardLine', () => {
  it('leads with an overdue follow-up', () => {
    const line = contactCardLine(
      { id: 'a' },
      index({ missedFollowUpMs: new Map([['a', at('2026-10-19T14:00')]]) }),
      'nextVisit',
      NOW
    )
    expect(line).toEqual({ text: 'Overdue · Mon', tone: 'overdue' })
  })

  it("shows today's follow-up with its time", () => {
    const line = contactCardLine(
      { id: 'a' },
      index({ nextFollowUpMs: new Map([['a', at('2026-10-21T14:00')]]) }),
      'nextVisit',
      NOW
    )
    expect(line).toEqual({ text: 'Today 2:00 PM', tone: 'due' })
  })

  it('falls back to the last visit, or says there was none', () => {
    const visited = index({
      mostRecentConvMs: new Map([['a', at('2026-10-17T09:00')]]),
    })
    expect(contactCardLine({ id: 'a' }, visited, 'nextVisit', NOW)).toEqual({
      text: 'Visited Sat',
      tone: 'plain',
    })
    expect(contactCardLine({ id: 'b' }, visited, 'lastVisit', NOW)).toEqual({
      text: 'No visits yet',
      tone: 'plain',
    })
  })

  it("shows a Custom Field's value, and nothing when it's empty", () => {
    const contact = { id: 'a', customFields: { lang: ' Spanish ' } }
    expect(contactCardLine(contact, index(), 'field:lang', NOW)).toEqual({
      text: 'Spanish',
      tone: 'plain',
    })
    expect(contactCardLine(contact, index(), 'field:other', NOW)).toBeNull()
    expect(contactCardLine(contact, index(), 'nameOnly', NOW)).toBeNull()
  })

  it("shows an open follow-up's topic", () => {
    const visits = index({
      nextFollowUpMs: new Map([['a', at('2026-10-24T10:00')]]),
      mostRecentConvByContact: new Map([
        [
          'a',
          {
            id: 'v',
            contact: { id: 'a' },
            date: new Date(),
            isBibleStudy: false,
            followUp: {
              date: new Date(),
              notifyMe: false,
              topic: 'Psalm 37:29',
            },
          },
        ],
      ]),
    })
    expect(contactCardLine({ id: 'a' }, visits, 'followUpTopic', NOW)).toEqual({
      text: 'Psalm 37:29',
      tone: 'due',
    })
  })
})

describe('resolveCardDetail', () => {
  const defs: CustomFieldDefinition[] = [
    { id: 'lang', label: 'Language', order: 0, createdAt: 0, updatedAt: 0 },
    {
      id: 'old',
      label: 'Old',
      order: 1,
      archived: true,
      createdAt: 0,
      updatedAt: 0,
    },
  ]
  it('keeps known details and live fields, else the default', () => {
    expect(resolveCardDetail('lastVisit', defs)).toBe('lastVisit')
    expect(resolveCardDetail('field:lang', defs)).toBe('field:lang')
    expect(resolveCardDetail('field:old', defs)).toBe('nextVisit')
    expect(resolveCardDetail('field:gone', defs)).toBe('nextVisit')
    expect(resolveCardDetail('fromTheFuture', defs)).toBe('nextVisit')
    expect(resolveCardDetail(undefined, defs)).toBe('nextVisit')
  })
})

describe('urgency, badges and due', () => {
  const visits = index({
    missedFollowUpMs: new Map([['overdue', at('2026-10-18T10:00')]]),
    nextFollowUpMs: new Map([
      ['today', at('2026-10-21T15:00')],
      ['soon', at('2026-10-25T15:00')],
      ['later', at('2026-11-20T15:00')],
    ]),
    mostRecentConvMs: new Map([
      ['stale', at('2026-06-01T10:00')],
      ['recent', at('2026-10-20T10:00')],
    ]),
  })
  const contacts = [
    { id: 'recent' },
    { id: 'never' },
    { id: 'favorite', isFavorite: true },
    { id: 'later' },
    { id: 'soon' },
    { id: 'stale' },
    { id: 'today' },
    { id: 'overdue' },
  ]

  it('ranks overdue, then due this week, then favorites, then stalest', () => {
    const order = [...contacts]
      .sort(
        (a, b) =>
          contactUrgency(a, visits, NOW) - contactUrgency(b, visits, NOW)
      )
      .map((c) => c.id)
    expect(order).toEqual([
      'overdue',
      'today',
      'soon',
      'favorite',
      'stale',
      'never',
      'later',
      'recent',
    ])
  })

  it('badges overdue, today and favorites', () => {
    expect(pinBadge({ id: 'overdue' }, visits, NOW)).toBe('overdue')
    expect(pinBadge({ id: 'today', isFavorite: true }, visits, NOW)).toBe(
      'today'
    )
    expect(pinBadge({ id: 'x', isFavorite: true }, visits, NOW)).toBe(
      'favorite'
    )
    expect(pinBadge({ id: 'soon' }, visits, NOW)).toBeUndefined()
  })

  it("keeps an earlier day's follow-up off today just after midnight", () => {
    const afterMidnight = at('2026-10-21T00:30')
    // Last night's, not missed yet: its weekday, not "Today".
    const lastNight = index({
      nextFollowUpMs: new Map([['late', at('2026-10-20T23:30')]]),
    })
    expect(followUpState('late', lastNight, afterMidnight)?.kind).toBe('soon')
    expect(
      contactCardLine({ id: 'late' }, lastNight, 'nextVisit', afterMidnight)
    ).toEqual({ text: 'Tue 11:30 PM', tone: 'due' })
    expect(pinBadge({ id: 'late' }, lastNight, afterMidnight)).toBeUndefined()
  })

  it('works out the same facts in one pass', () => {
    for (const contact of contacts) {
      expect(contactPinFacts(contact, visits, NOW)).toEqual({
        followUp: followUpState(contact.id, visits, NOW),
        urgency: contactUrgency(contact, visits, NOW),
        badge: pinBadge(contact, visits, NOW),
      })
    }
  })
})

describe('pinInitials', () => {
  it('takes the first and last word', () => {
    expect(pinInitials('Maria del Carmen Reyes')).toBe('MR')
    expect(pinInitials('  lin ')).toBe('L')
    expect(pinInitials('')).toBe('•')
  })
})

describe('groups', () => {
  const oak = { address: { line1: '412 Oak St' } }
  const elm = { address: { line1: '9 Elm' } }

  it('names the shared street, else counts', () => {
    expect(groupTitle([oak, { address: { line1: '412 oak st ' } }])).toBe(
      '2 · 412 Oak St'
    )
    expect(groupTitle([oak, elm])).toBe('2 contacts')
  })

  it('reads the count and street to screen readers in words', () => {
    expect(groupAccessibilityLabel([oak, oak, oak])).toBe(
      '3 contacts at 412 Oak St'
    )
    expect(groupAccessibilityLabel([oak, elm])).toBe('2 contacts')
  })
})
