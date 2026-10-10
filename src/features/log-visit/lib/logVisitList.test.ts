import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, opts?: { count?: number }) =>
      opts?.count === undefined ? key : `${key}:${opts.count}`,
  },
}))

import {
  buildBrowseItems,
  buildSearchItems,
  sortContactsByName,
  type LogVisitListItem,
} from '@/features/log-visit/lib/logVisitList'
import type { SuggestedContacts } from '@/lib/suggestedContacts'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'

const now = new Date('2026-10-09T12:00:00')
const day = 86_400_000

const contact = (id: string, name = id, line1?: string): Contact => ({
  id,
  name,
  createdAt: new Date('2026-01-01'),
  ...(line1 === undefined
    ? {}
    : {
        address: {
          line1,
          line2: '',
          city: '',
          state: '',
          zip: '',
          country: '',
        },
      }),
})

const dueVisit = (contactId: string, daysOverdue: number): Visit => ({
  id: `v-${contactId}`,
  contact: { id: contactId },
  date: new Date(now.getTime() - 20 * day),
  isBibleStudy: false,
  followUp: {
    date: new Date(now.getTime() - daysOverdue * day),
    notifyMe: false,
  },
})

/** Compact view of the items: headers by section, rows as `from:id[detail]`. */
const describeItems = (items: LogVisitListItem[]) =>
  items.map((item) => {
    switch (item.type) {
      case 'header':
        return `# ${item.section}`
      case 'contact':
        return `${item.pickedFrom}:${item.contact.id}${
          item.detail ? ` [${item.detail.text}|${item.detail.tone}]` : ''
        }`
      case 'noMatches':
        return `none:${item.query}`
      case 'addNew':
        return `add:${item.name}`
    }
  })

describe('sortContactsByName', () => {
  it('sorts A–Z ignoring case and accents, numbers naturally', () => {
    const sorted = sortContactsByName([
      contact('1', 'zoe'),
      contact('2', 'Émile'),
      contact('3', 'apt 10'),
      contact('4', 'Apt 9'),
      contact('5', 'Bob'),
    ])
    expect(sorted.map((c) => c.name)).toEqual([
      'Apt 9',
      'apt 10',
      'Bob',
      'Émile',
      'zoe',
    ])
  })
})

describe('buildBrowseItems', () => {
  const maria = contact('maria', 'Maria', '412 Oak St')
  const tom = contact('tom', 'Tom', ' 412 Oak St, Apt 7 ')
  const priya = contact('priya', 'Priya')
  const grace = contact('grace', 'Grace')
  const anna = contact('anna', 'Anna')

  const suggested: Pick<SuggestedContacts, 'sections' | 'dueFollowUpById'> = {
    sections: [
      { key: 'nearby', contacts: [maria, tom] },
      { key: 'followUpsDue', contacts: [priya] },
      { key: 'recent', contacts: [grace] },
    ],
    dueFollowUpById: new Map([
      ['maria', dueVisit('maria', 0)],
      ['priya', dueVisit('priya', 5)],
    ]),
  }

  it('lists suggested sections, then everyone A–Z under All Contacts', () => {
    const items = buildBrowseItems({
      suggested,
      contacts: [tom, grace, maria, priya, anna],
      currentTime: now,
    })
    expect(describeItems(items)).toEqual([
      '# nearby',
      'nearby:maria [suggested_followUpToday · 412 Oak St|due]',
      'nearby:tom [412 Oak St, Apt 7|default]',
      '# followUpsDue',
      'followUpsDue:priya [suggested_followUpOverdue:5|due]',
      '# recent',
      'recent:grace',
      '# all',
      'all:anna',
      'all:grace',
      'all:maria',
      'all:priya',
      'all:tom',
    ])
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length)
  })

  it('leaves a Nearby row with no address or due Follow-up on its default line', () => {
    const lone = contact('lone', 'Lone')
    const items = buildBrowseItems({
      suggested: {
        sections: [{ key: 'nearby', contacts: [lone] }],
        dueFollowUpById: new Map(),
      },
      contacts: [lone],
      currentTime: now,
    })
    expect(describeItems(items)).toEqual([
      '# nearby',
      'nearby:lone',
      '# all',
      'all:lone',
    ])
  })

  it('shows the A–Z list without a header when nothing is suggested', () => {
    const items = buildBrowseItems({
      suggested: { sections: [], dueFollowUpById: new Map() },
      contacts: [tom, anna],
      currentTime: now,
    })
    expect(describeItems(items)).toEqual(['all:anna', 'all:tom'])
  })

  it('is empty without Contacts', () => {
    expect(
      buildBrowseItems({
        suggested: { sections: [], dueFollowUpById: new Map() },
        contacts: [],
      })
    ).toEqual([])
  })
})

describe('buildSearchItems', () => {
  it('lists matches, then adds the trimmed query as a new Contact', () => {
    const items = buildSearchItems('  ros ', [
      { contact: contact('rosa', 'Rosa'), matches: [] },
      { contact: contact('ross', 'Ross') },
    ])
    expect(describeItems(items)).toEqual([
      'search:rosa',
      'search:ross',
      'add:ros',
    ])
  })

  it('says nothing matched before the add row', () => {
    expect(describeItems(buildSearchItems('rosa', []))).toEqual([
      'none:rosa',
      'add:rosa',
    ])
  })

  it('is empty for a blank query', () => {
    expect(buildSearchItems('   ', [])).toEqual([])
  })
})
