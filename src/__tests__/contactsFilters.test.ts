import moment from 'moment'
import { describe, expect, it } from 'vitest'
import {
  ActiveFilter,
  applyFilters,
  FilterContext,
} from '@/lib/contactsFilters'
import { Contact } from '@/types/contact'
import { Conversation } from '@/types/conversation'
import { CustomFieldDefinition } from '@/types/customField'

const baseContact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'John Doe',
  createdAt: moment().subtract(1, 'year').toDate(),
  ...overrides,
})

const emptyCtx = (overrides: Partial<FilterContext> = {}): FilterContext => ({
  conversations: [],
  customFieldDefs: [],
  ...overrides,
})

describe('lib/contactsFilters', () => {
  describe('applyFilters', () => {
    it('returns the input unchanged when filter list is empty', () => {
      const a = baseContact({ id: 'a', name: 'Alice' })
      const b = baseContact({ id: 'b', name: 'Bob' })
      const contacts = [a, b]
      const result = applyFilters(contacts, [], emptyCtx())
      expect(result).toEqual(contacts)
    })

    it('AND-stacks filters: only contacts matching every filter pass', () => {
      const alice = baseContact({
        id: 'a',
        name: 'Alice Smith',
        email: 'alice@example.com',
      })
      const bob = baseContact({
        id: 'b',
        name: 'Bob Smith',
        email: 'bob@other.com',
      })
      const carol = baseContact({
        id: 'c',
        name: 'Carol Jones',
        email: 'carol@example.com',
      })
      const filters: ActiveFilter[] = [
        { kind: 'name', op: 'contains', value: 'smith' },
        { kind: 'email', op: 'contains', value: 'example.com' },
      ]
      const result = applyFilters([alice, bob, carol], filters, emptyCtx())
      expect(result).toEqual([alice])
    })
  })

  describe('text operators on identity fields', () => {
    const alice = baseContact({
      id: 'a',
      name: 'Alice Smith',
      phone: '555-1234',
      email: 'alice@example.com',
    })
    const bob = baseContact({
      id: 'b',
      name: 'Bob Smith',
      phone: '',
      email: '',
    })
    const all = [alice, bob]

    it('name equals (case-insensitive)', () => {
      const result = applyFilters(
        all,
        [{ kind: 'name', op: 'equals', value: 'ALICE SMITH' }],
        emptyCtx()
      )
      expect(result).toEqual([alice])
    })

    it('name contains (case-insensitive)', () => {
      const result = applyFilters(
        all,
        [{ kind: 'name', op: 'contains', value: 'ALICE' }],
        emptyCtx()
      )
      expect(result).toEqual([alice])
    })

    it('name startsWith', () => {
      const result = applyFilters(
        all,
        [{ kind: 'name', op: 'startsWith', value: 'Bob' }],
        emptyCtx()
      )
      expect(result).toEqual([bob])
    })

    it('phone isSet returns only contacts with a phone', () => {
      const result = applyFilters(
        all,
        [{ kind: 'phone', op: 'isSet', value: '' }],
        emptyCtx()
      )
      expect(result).toEqual([alice])
    })

    it('email notSet returns only contacts without an email', () => {
      const result = applyFilters(
        all,
        [{ kind: 'email', op: 'notSet', value: '' }],
        emptyCtx()
      )
      expect(result).toEqual([bob])
    })
  })

  describe('address fields', () => {
    const cincy = baseContact({
      id: '1',
      name: 'Cincy Person',
      address: { city: 'Cincinnati', state: 'OH', zip: '41017' },
    })
    const columbus = baseContact({
      id: '2',
      name: 'Columbus Person',
      address: { city: 'Columbus', state: 'OH', zip: '43004' },
    })
    const all = [cincy, columbus]

    it('city equals (case-insensitive)', () => {
      const result = applyFilters(
        all,
        [{ kind: 'city', op: 'equals', value: 'cincinnati' }],
        emptyCtx()
      )
      expect(result).toEqual([cincy])
    })

    it('state contains', () => {
      const result = applyFilters(
        all,
        [{ kind: 'state', op: 'contains', value: 'oh' }],
        emptyCtx()
      )
      expect(result).toEqual(all)
    })

    it('zip contains', () => {
      const result = applyFilters(
        all,
        [{ kind: 'zip', op: 'contains', value: '410' }],
        emptyCtx()
      )
      expect(result).toEqual([cincy])
    })
  })

  describe('customField filter', () => {
    const textDef: CustomFieldDefinition = {
      id: 'lang',
      label: 'Language',
      order: 0,
      createdAt: 0,
      updatedAt: 0,
      type: 'text',
    }
    const archivedDef: CustomFieldDefinition = {
      id: 'archived',
      label: 'Archived',
      order: 1,
      createdAt: 0,
      updatedAt: 0,
      type: 'text',
      archived: true,
    }
    const numDef: CustomFieldDefinition = {
      id: 'age',
      label: 'Age',
      order: 2,
      createdAt: 0,
      updatedAt: 0,
      type: 'number',
    }
    const dateDef: CustomFieldDefinition = {
      id: 'birthday',
      label: 'Birthday',
      order: 3,
      createdAt: 0,
      updatedAt: 0,
      type: 'date',
    }

    it('text contains finds the right contact (using non-archived def)', () => {
      const a = baseContact({
        id: 'a',
        name: 'A',
        customFields: { lang: 'Spanish speaker' },
      })
      const b = baseContact({
        id: 'b',
        name: 'B',
        customFields: { lang: 'French speaker' },
      })
      const result = applyFilters(
        [a, b],
        [
          {
            kind: 'customField',
            defId: 'lang',
            op: 'contains',
            value: 'spanish',
          },
        ],
        emptyCtx({ customFieldDefs: [textDef, archivedDef] })
      )
      expect(result).toEqual([a])
    })

    it('numeric gt with type:number compares numerically', () => {
      const a = baseContact({ id: 'a', name: 'A', customFields: { age: '30' } })
      const b = baseContact({ id: 'b', name: 'B', customFields: { age: '7' } })
      const result = applyFilters(
        [a, b],
        [{ kind: 'customField', defId: 'age', op: 'gt', value: '10' }],
        emptyCtx({ customFieldDefs: [numDef] })
      )
      expect(result).toEqual([a])
    })

    it('numeric lt with type:number compares numerically', () => {
      const a = baseContact({ id: 'a', name: 'A', customFields: { age: '30' } })
      const b = baseContact({ id: 'b', name: 'B', customFields: { age: '7' } })
      const result = applyFilters(
        [a, b],
        [{ kind: 'customField', defId: 'age', op: 'lt', value: '10' }],
        emptyCtx({ customFieldDefs: [numDef] })
      )
      expect(result).toEqual([b])
    })

    it('falls back to lexicographic when values are non-numeric', () => {
      // 'banana' > 'apple' lexicographically, and neither parses as number
      const a = baseContact({
        id: 'a',
        name: 'A',
        customFields: { age: 'banana' },
      })
      const b = baseContact({
        id: 'b',
        name: 'B',
        customFields: { age: 'apple' },
      })
      const result = applyFilters(
        [a, b],
        [{ kind: 'customField', defId: 'age', op: 'gt', value: 'avocado' }],
        emptyCtx({ customFieldDefs: [numDef] })
      )
      // 'banana' > 'avocado', 'apple' < 'avocado'
      expect(result).toEqual([a])
    })

    it('date gt with type:date compares chronologically', () => {
      const earlier = '2020-01-01'
      const later = '2024-06-15'
      const cutoff = '2022-01-01'
      const a = baseContact({
        id: 'a',
        name: 'A',
        customFields: { birthday: later },
      })
      const b = baseContact({
        id: 'b',
        name: 'B',
        customFields: { birthday: earlier },
      })
      const result = applyFilters(
        [a, b],
        [{ kind: 'customField', defId: 'birthday', op: 'gt', value: cutoff }],
        emptyCtx({ customFieldDefs: [dateDef] })
      )
      expect(result).toEqual([a])
    })

    it('date lt with type:date compares chronologically', () => {
      const earlier = '2020-01-01'
      const later = '2024-06-15'
      const cutoff = '2022-01-01'
      const a = baseContact({
        id: 'a',
        name: 'A',
        customFields: { birthday: later },
      })
      const b = baseContact({
        id: 'b',
        name: 'B',
        customFields: { birthday: earlier },
      })
      const result = applyFilters(
        [a, b],
        [{ kind: 'customField', defId: 'birthday', op: 'lt', value: cutoff }],
        emptyCtx({ customFieldDefs: [dateDef] })
      )
      expect(result).toEqual([b])
    })
  })

  describe('pinStaleness filter', () => {
    it('matches a contact whose most-recent conversation is ~2 months ago to bucket=month', () => {
      const c = baseContact({ id: 'c1', name: 'Stale' })
      const conversations: Conversation[] = [
        {
          id: 'conv1',
          contact: { id: c.id },
          date: moment().subtract(2, 'months').toDate(),
          isBibleStudy: false,
        },
      ]
      const result = applyFilters(
        [c],
        [{ kind: 'pinStaleness', value: 'month' }],
        emptyCtx({ conversations })
      )
      expect(result).toEqual([c])
    })

    it('matches a contact with no conversations to bucket=never', () => {
      const c = baseContact({ id: 'c1', name: 'Brand New' })
      const result = applyFilters(
        [c],
        [{ kind: 'pinStaleness', value: 'never' }],
        emptyCtx()
      )
      expect(result).toEqual([c])
    })

    it('does not match a never-contact when filter expects month', () => {
      const c = baseContact({ id: 'c1', name: 'Brand New' })
      const result = applyFilters(
        [c],
        [{ kind: 'pinStaleness', value: 'month' }],
        emptyCtx()
      )
      expect(result).toEqual([])
    })
  })

  describe('boolean filters', () => {
    it('isFavorite keeps only favorited contacts', () => {
      const fav = baseContact({ id: 'f', name: 'Fav', isFavorite: true })
      const reg = baseContact({ id: 'r', name: 'Regular' })
      const result = applyFilters(
        [fav, reg],
        [{ kind: 'isFavorite' }],
        emptyCtx()
      )
      expect(result).toEqual([fav])
    })

    it('hasStudy keeps only contacts with at least one study conversation', () => {
      const study = baseContact({ id: 's', name: 'Studies' })
      const noStudy = baseContact({ id: 'n', name: 'No Studies' })
      const conversations: Conversation[] = [
        {
          id: 'conv1',
          contact: { id: study.id },
          date: moment().subtract(1, 'year').toDate(),
          isBibleStudy: true,
        },
        {
          id: 'conv2',
          contact: { id: noStudy.id },
          date: moment().toDate(),
          isBibleStudy: false,
        },
      ]
      const result = applyFilters(
        [study, noStudy],
        [{ kind: 'hasStudy' }],
        emptyCtx({ conversations })
      )
      expect(result).toEqual([study])
    })

    it('isActiveStudy keeps only contacts with a study conversation in current month', () => {
      const active = baseContact({ id: 'a', name: 'Active' })
      const lapsed = baseContact({ id: 'l', name: 'Lapsed' })
      const conversations: Conversation[] = [
        {
          id: 'conv1',
          contact: { id: active.id },
          date: moment().toDate(),
          isBibleStudy: true,
        },
        {
          id: 'conv2',
          contact: { id: lapsed.id },
          date: moment().subtract(6, 'months').toDate(),
          isBibleStudy: true,
        },
      ]
      const result = applyFilters(
        [active, lapsed],
        [{ kind: 'isActiveStudy' }],
        emptyCtx({ conversations })
      )
      expect(result).toEqual([active])
    })
  })
})
