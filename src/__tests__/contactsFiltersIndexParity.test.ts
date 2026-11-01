import moment from 'moment'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ActiveFilter,
  applyFilters,
  FilterContext,
} from '@/lib/contactsFilters'
import { buildConversationIndex } from '@/lib/conversationIndex'
import { filterActivesContacts } from '@/lib/dismissedContacts'
import { DEFAULT_STALENESS_BREAKPOINTS } from '@/constants/staleness'
import { StalenessBreakpoints } from '@/types/staleness'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

const generate = (contactCount: number, visitCount: number) => {
  const rand = rng(42)
  const now = moment()
  const contacts: Contact[] = Array.from({ length: contactCount }, (_, i) => ({
    id: `c${i}`,
    name: `Person ${i}`,
    createdAt: now.clone().subtract(2, 'years').toDate(),
    isFavorite: i % 7 === 0,
    ...(i % 11 === 0
      ? { dismissedUntil: now.clone().add(3, 'days').toDate() }
      : i % 13 === 0
        ? { dismissedUntil: now.clone().subtract(3, 'days').toDate() }
        : {}),
  }))

  const visits: Visit[] = []
  for (let v = 0; v < visitCount; v++) {
    const archived = rand() < 0.03
    const idx = Math.floor(rand() * contactCount)
    if (!archived && idx % 5 === 4) continue

    const daysAgo = Math.floor(rand() * 120)

    const followUpHours = Math.floor(rand() * 50 * 24) - 40 * 24 + 0.5
    visits.push({
      id: `v${v}`,
      contact: { id: archived ? `archived${idx}` : `c${idx}` },
      date: now.clone().subtract(daysAgo, 'days').subtract(6, 'hours').toDate(),
      isBibleStudy: rand() < 0.25,
      ...(rand() < 0.3
        ? {
            followUp: {
              date: now.clone().add(followUpHours, 'hours').toDate(),
              notifyMe: true,
              ...(rand() < 0.1 ? { dismissed: true } : {}),
            },
          }
        : {}),
    })
  }

  visits.push(
    {
      id: 'start-of-month',
      contact: { id: 'c1' },
      date: now.clone().startOf('month').add(1, 'minute').toDate(),
      isBibleStudy: true,
    },
    {
      id: 'end-of-last-month',
      contact: { id: 'c2' },
      date: now.clone().startOf('month').subtract(1, 'minute').toDate(),
      isBibleStudy: true,
    }
  )

  return { contacts, visits }
}

const FILTER_SETS: ActiveFilter[][] = [
  [{ kind: 'pinStaleness', value: 'never' }],
  [{ kind: 'pinStaleness', value: 'recent' }],
  [{ kind: 'pinStaleness', value: 'week' }],
  [{ kind: 'pinStaleness', value: 'month' }],
  [{ kind: 'hasStudy' }],
  [{ kind: 'isActiveStudy' }],
  [{ kind: 'hasStudy' }, { kind: 'pinStaleness', value: 'month' }],
  [{ kind: 'isActiveStudy' }, { kind: 'isFavorite' }],
  [
    { kind: 'name', op: 'contains', value: '1' },
    { kind: 'pinStaleness', value: 'week' },
  ],
  [{ kind: 'hasFollowUp' }],
  [{ kind: 'noFollowUp' }],
  [{ kind: 'followUpOverdue' }],
  [{ kind: 'followUpOverdue' }, { kind: 'hasFollowUp' }],
  [{ kind: 'noFollowUp' }, { kind: 'pinStaleness', value: 'recent' }],
]

const BREAKPOINTS: StalenessBreakpoints[] = [
  DEFAULT_STALENESS_BREAKPOINTS,
  { weekDays: 3, monthDays: 45 },
]

describe('applyFilters with a ConversationIndex', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-17T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  for (const breakpoints of BREAKPOINTS) {
    it(`matches the conversation scan (${breakpoints.weekDays}/${breakpoints.monthDays} days)`, () => {
      const { contacts, visits } = generate(300, 1500)
      const base: FilterContext = {
        conversations: visits,
        customFieldDefs: [],
        stalenessBreakpoints: breakpoints,
      }
      const indexed: FilterContext = {
        ...base,
        conversationIndex: buildConversationIndex(visits, breakpoints),
      }

      for (const list of [contacts, filterActivesContacts(contacts)]) {
        for (const filters of FILTER_SETS) {
          const expected = applyFilters(list, filters, base).map((c) => c.id)
          const actual = applyFilters(list, filters, indexed).map((c) => c.id)
          expect(actual).toEqual(expected)
        }
      }
    })
  }

  it('covers every bucket and both study cases', () => {
    const { contacts, visits } = generate(300, 1500)
    const ctx: FilterContext = {
      conversations: visits,
      customFieldDefs: [],
      stalenessBreakpoints: DEFAULT_STALENESS_BREAKPOINTS,
    }
    for (const filters of FILTER_SETS.slice(0, 6)) {
      expect(applyFilters(contacts, filters, ctx).length).toBeGreaterThan(0)
    }
    const withAnyStudy = applyFilters(
      contacts,
      [{ kind: 'hasStudy' }],
      ctx
    ).length
    const studiedThisMonth = applyFilters(
      contacts,
      [{ kind: 'isActiveStudy' }],
      ctx
    ).length
    expect(withAnyStudy).toBeGreaterThan(studiedThisMonth)
    for (const kind of [
      'hasFollowUp',
      'noFollowUp',
      'followUpOverdue',
    ] as const) {
      expect(applyFilters(contacts, [{ kind }], ctx).length).toBeGreaterThan(0)
    }
  })
})
