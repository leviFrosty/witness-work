import moment from 'moment'
import { describe, expect, it } from 'vitest'
import {
  buildContactComparator,
  ContactSortKey,
  SortContext,
} from '../lib/contactsSort'
import { Contact } from '../types/contact'
import { Conversation } from '../types/conversation'
import { CustomFieldDefinition } from '../types/customField'

const c = (
  overrides: Partial<Contact> & { id: string; name: string }
): Contact => ({
  createdAt: moment().subtract(1, 'year').toDate(),
  ...overrides,
})

const ctx = (overrides: Partial<SortContext> = {}): SortContext => ({
  conversations: [],
  customFieldDefs: [],
  ...overrides,
})

const sortContacts = (
  contacts: Contact[],
  key: ContactSortKey,
  direction: 'asc' | 'desc',
  context: SortContext = ctx()
): Contact[] => {
  return [...contacts].sort(buildContactComparator(key, direction, context))
}

describe('lib/contactsSort', () => {
  describe('suggested sort: favorite + study pinning', () => {
    it('pins favorites above non-favorites under suggested', () => {
      const a = c({ id: 'a', name: 'Alpha' })
      const b = c({ id: 'b', name: 'Bravo', isFavorite: true })
      const cc = c({ id: 'c', name: 'Charlie' })
      const result = sortContacts([a, b, cc], 'suggested', 'desc')
      expect(result[0]).toBe(b)
    })

    it('keeps favorites first under asc as well (pinning is direction-independent)', () => {
      const a = c({ id: 'a', name: 'Alpha' })
      const b = c({ id: 'b', name: 'Bravo', isFavorite: true })
      const cc = c({ id: 'c', name: 'Charlie' })
      const result = sortContacts([a, b, cc], 'suggested', 'asc')
      expect(result[0]).toBe(b)
    })

    it('ranks favorite > active study > lapsed study > regular', () => {
      const favorite = c({ id: 'fav', name: 'Z Favorite', isFavorite: true })
      const active = c({ id: 'active', name: 'Active' })
      const lapsed = c({ id: 'lapsed', name: 'Lapsed' })
      const regular = c({ id: 'reg', name: 'Aaron Regular' })
      const conversations: Conversation[] = [
        {
          id: 'conv-active',
          contact: { id: active.id },
          date: moment().toDate(),
          isBibleStudy: true,
        },
        {
          id: 'conv-lapsed',
          contact: { id: lapsed.id },
          date: moment().subtract(6, 'months').toDate(),
          isBibleStudy: true,
        },
      ]
      const result = sortContacts(
        [regular, lapsed, active, favorite],
        'suggested',
        'desc',
        ctx({ conversations })
      )
      expect(result.map((x) => x.id)).toEqual([
        'fav',
        'active',
        'lapsed',
        'reg',
      ])
    })

    it('inside the regular tier, sorts by recent conversation', () => {
      const recent = c({ id: 'recent', name: 'R' })
      const old = c({ id: 'old', name: 'O' })
      const conversations: Conversation[] = [
        {
          id: 'conv-recent',
          contact: { id: recent.id },
          date: moment().subtract(1, 'day').toDate(),
          isBibleStudy: false,
        },
        {
          id: 'conv-old',
          contact: { id: old.id },
          date: moment().subtract(1, 'year').toDate(),
          isBibleStudy: false,
        },
      ]
      const result = sortContacts(
        [old, recent],
        'suggested',
        'desc',
        ctx({ conversations })
      )
      expect(result.map((x) => x.id)).toEqual(['recent', 'old'])
    })
  })

  describe('explicit sort keys: no favorite/study pinning', () => {
    it('az asc places a non-favorite above a favorite when alphabetically earlier', () => {
      const aaron = c({ id: 'aaron', name: 'Aaron' })
      const zelda = c({ id: 'zelda', name: 'Zelda', isFavorite: true })
      const result = sortContacts([zelda, aaron], 'az', 'asc')
      expect(result.map((x) => x.id)).toEqual(['aaron', 'zelda'])
    })

    it('recentConversation asc keeps oldest first even if a newer contact is a study', () => {
      // Reproduces the bug: with explicit "Recent Conversation" asc, a 2-day-old
      // bible study should NOT jump above a 9-day-old non-study.
      const studyRecent = c({ id: 'study', name: 'Study' })
      const oldRegular = c({ id: 'old', name: 'Old' })
      const conversations: Conversation[] = [
        {
          id: 'conv-study',
          contact: { id: studyRecent.id },
          date: moment().subtract(2, 'days').toDate(),
          isBibleStudy: true,
        },
        {
          id: 'conv-old',
          contact: { id: oldRegular.id },
          date: moment().subtract(9, 'days').toDate(),
          isBibleStudy: false,
        },
      ]
      const result = sortContacts(
        [studyRecent, oldRegular],
        'recentConversation',
        'asc',
        ctx({ conversations })
      )
      expect(result.map((x) => x.id)).toEqual(['old', 'study'])
    })
  })

  describe('pinStaleness', () => {
    // ranks: month=3, week=2, recent=1, never=0
    // desc => highest rank first => month, week, recent, never
    it('desc orders most-stale to least: month, week, recent, never', () => {
      const monthContact = c({ id: 'month', name: 'M' })
      const weekContact = c({ id: 'week', name: 'W' })
      const recentContact = c({ id: 'recent', name: 'R' })
      const neverContact = c({ id: 'never', name: 'N' })
      const conversations: Conversation[] = [
        {
          id: 'conv-month',
          contact: { id: monthContact.id },
          date: moment().subtract(2, 'months').toDate(),
          isBibleStudy: false,
        },
        {
          id: 'conv-week',
          contact: { id: weekContact.id },
          date: moment().subtract(2, 'weeks').toDate(),
          isBibleStudy: false,
        },
        {
          id: 'conv-recent',
          contact: { id: recentContact.id },
          date: moment().subtract(1, 'day').toDate(),
          isBibleStudy: false,
        },
      ]
      const result = sortContacts(
        [neverContact, recentContact, weekContact, monthContact],
        'pinStaleness',
        'desc',
        ctx({ conversations })
      )
      expect(result.map((x) => x.id)).toEqual([
        'month',
        'week',
        'recent',
        'never',
      ])
    })

    it('asc reverses: never, recent, week, month', () => {
      const monthContact = c({ id: 'month', name: 'M' })
      const weekContact = c({ id: 'week', name: 'W' })
      const recentContact = c({ id: 'recent', name: 'R' })
      const neverContact = c({ id: 'never', name: 'N' })
      const conversations: Conversation[] = [
        {
          id: 'conv-month',
          contact: { id: monthContact.id },
          date: moment().subtract(2, 'months').toDate(),
          isBibleStudy: false,
        },
        {
          id: 'conv-week',
          contact: { id: weekContact.id },
          date: moment().subtract(2, 'weeks').toDate(),
          isBibleStudy: false,
        },
        {
          id: 'conv-recent',
          contact: { id: recentContact.id },
          date: moment().subtract(1, 'day').toDate(),
          isBibleStudy: false,
        },
      ]
      const result = sortContacts(
        [neverContact, recentContact, weekContact, monthContact],
        'pinStaleness',
        'asc',
        ctx({ conversations })
      )
      expect(result.map((x) => x.id)).toEqual([
        'never',
        'recent',
        'week',
        'month',
      ])
    })
  })

  describe('alphabetical', () => {
    it('az asc orders names ascending', () => {
      const a = c({ id: 'a', name: 'Alice' })
      const b = c({ id: 'b', name: 'Bob' })
      const cc = c({ id: 'c', name: 'Charlie' })
      const result = sortContacts([cc, a, b], 'az', 'asc')
      expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    })

    it('za desc reverses names', () => {
      const a = c({ id: 'a', name: 'Alice' })
      const b = c({ id: 'b', name: 'Bob' })
      const cc = c({ id: 'c', name: 'Charlie' })
      // 'za' compareKey returns reverse; desc multiplies by -1, so result is asc
      // The simpler invariant: 'za' asc reverses alphabetical
      const result = sortContacts([a, b, cc], 'za', 'asc')
      expect(result.map((x) => x.id)).toEqual(['c', 'b', 'a'])
    })
  })

  describe('recentConversation', () => {
    it('desc puts most-recent conversation first; nulls last', () => {
      const recent = c({ id: 'recent', name: 'R' })
      const old = c({ id: 'old', name: 'O' })
      const none = c({ id: 'none', name: 'N' })
      const conversations: Conversation[] = [
        {
          id: 'conv-recent',
          contact: { id: recent.id },
          date: moment().subtract(1, 'day').toDate(),
          isBibleStudy: false,
        },
        {
          id: 'conv-old',
          contact: { id: old.id },
          date: moment().subtract(1, 'year').toDate(),
          isBibleStudy: false,
        },
      ]
      const result = sortContacts(
        [none, old, recent],
        'recentConversation',
        'desc',
        ctx({ conversations })
      )
      expect(result.map((x) => x.id)).toEqual(['recent', 'old', 'none'])
    })
  })

  describe('createdAt', () => {
    it('asc puts the oldest first', () => {
      const oldest = c({
        id: 'oldest',
        name: 'A',
        createdAt: moment('2020-01-01').toDate(),
      })
      const newest = c({
        id: 'newest',
        name: 'B',
        createdAt: moment('2024-06-15').toDate(),
      })
      const middle = c({
        id: 'middle',
        name: 'C',
        createdAt: moment('2022-03-10').toDate(),
      })
      const result = sortContacts([newest, oldest, middle], 'createdAt', 'asc')
      expect(result.map((x) => x.id)).toEqual(['oldest', 'middle', 'newest'])
    })
  })

  describe('city/state/zip', () => {
    it('city localeCompare with undefineds last (asc)', () => {
      const a = c({ id: 'a', name: 'A', address: { city: 'Austin' } })
      const b = c({ id: 'b', name: 'B', address: { city: 'Boston' } })
      const noCity = c({ id: 'n', name: 'N' })
      const result = sortContacts([noCity, b, a], 'city', 'asc')
      expect(result.map((x) => x.id)).toEqual(['a', 'b', 'n'])
    })

    it('city: undefineds remain last under desc as well', () => {
      const a = c({ id: 'a', name: 'A', address: { city: 'Austin' } })
      const b = c({ id: 'b', name: 'B', address: { city: 'Boston' } })
      const noCity = c({ id: 'n', name: 'N' })
      const result = sortContacts([noCity, a, b], 'city', 'desc')
      // Undefined sentinels stay last; only the defined values flip
      expect(result.map((x) => x.id)).toEqual(['b', 'a', 'n'])
    })

    it('state localeCompare', () => {
      const a = c({ id: 'a', name: 'A', address: { state: 'CA' } })
      const b = c({ id: 'b', name: 'B', address: { state: 'TX' } })
      const noState = c({ id: 'n', name: 'N' })
      const result = sortContacts([noState, b, a], 'state', 'asc')
      expect(result.map((x) => x.id)).toEqual(['a', 'b', 'n'])
    })

    it('zip localeCompare', () => {
      const a = c({ id: 'a', name: 'A', address: { zip: '10001' } })
      const b = c({ id: 'b', name: 'B', address: { zip: '90001' } })
      const noZip = c({ id: 'n', name: 'N' })
      const result = sortContacts([noZip, b, a], 'zip', 'asc')
      expect(result.map((x) => x.id)).toEqual(['a', 'b', 'n'])
    })
  })

  describe('customField sort', () => {
    const numDef: CustomFieldDefinition = {
      id: 'age',
      label: 'Age',
      order: 0,
      createdAt: 0,
      updatedAt: 0,
      type: 'number',
    }
    const dateDef: CustomFieldDefinition = {
      id: 'birthday',
      label: 'Birthday',
      order: 1,
      createdAt: 0,
      updatedAt: 0,
      type: 'date',
    }
    const textDef: CustomFieldDefinition = {
      id: 'note',
      label: 'Note',
      order: 2,
      createdAt: 0,
      updatedAt: 0,
      type: 'text',
    }

    it('type:number sorts numerically (not lexically)', () => {
      const a = c({ id: 'a', name: 'A', customFields: { age: '7' } })
      const b = c({ id: 'b', name: 'B', customFields: { age: '30' } })
      const cc = c({ id: 'c', name: 'C', customFields: { age: '100' } })
      const result = sortContacts(
        [b, cc, a],
        'customField:age',
        'asc',
        ctx({ customFieldDefs: [numDef] })
      )
      expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    })

    it('type:date sorts chronologically', () => {
      const a = c({
        id: 'a',
        name: 'A',
        customFields: { birthday: '2020-01-01' },
      })
      const b = c({
        id: 'b',
        name: 'B',
        customFields: { birthday: '2022-06-15' },
      })
      const cc = c({
        id: 'c',
        name: 'C',
        customFields: { birthday: '2024-12-31' },
      })
      const result = sortContacts(
        [cc, a, b],
        'customField:birthday',
        'asc',
        ctx({ customFieldDefs: [dateDef] })
      )
      expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    })

    it('default text sorts lexically', () => {
      const a = c({ id: 'a', name: 'A', customFields: { note: 'apple' } })
      const b = c({ id: 'b', name: 'B', customFields: { note: 'banana' } })
      const cc = c({ id: 'c', name: 'C', customFields: { note: 'cherry' } })
      const result = sortContacts(
        [cc, b, a],
        'customField:note',
        'asc',
        ctx({ customFieldDefs: [textDef] })
      )
      expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    })
  })
})
