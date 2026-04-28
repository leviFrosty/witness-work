import moment from 'moment'
import { describe, expect, it } from 'vitest'
import { buildContactsFuse, searchContactsFuzzy } from '../lib/contactsSearch'
import { Contact } from '../types/contact'
import { Conversation } from '../types/conversation'

const c = (
  overrides: Partial<Contact> & { id: string; name: string }
): Contact => ({
  createdAt: moment().subtract(1, 'year').toDate(),
  ...overrides,
})

describe('lib/contactsSearch', () => {
  describe('searchContactsFuzzy', () => {
    it('returns input unchanged when query is empty', () => {
      const a = c({ id: 'a', name: 'Alice' })
      const b = c({ id: 'b', name: 'Bob' })
      const contacts = [a, b]
      const fuse = buildContactsFuse(contacts, [])
      const result = searchContactsFuzzy('', fuse, contacts)
      expect(result).toEqual(contacts)
    })

    it('returns input unchanged when query is only whitespace', () => {
      const a = c({ id: 'a', name: 'Alice' })
      const b = c({ id: 'b', name: 'Bob' })
      const contacts = [a, b]
      const fuse = buildContactsFuse(contacts, [])
      const result = searchContactsFuzzy('   \t  ', fuse, contacts)
      expect(result).toEqual(contacts)
    })

    it('returns the contact for an exact name match', () => {
      const alice = c({ id: 'a', name: 'Alice Wonderland' })
      const bob = c({ id: 'b', name: 'Bob Builder' })
      const contacts = [alice, bob]
      const fuse = buildContactsFuse(contacts, [])
      const result = searchContactsFuzzy('Alice Wonderland', fuse, contacts)
      expect(result.map((r) => r.id)).toContain('a')
      expect(result[0].id).toBe('a')
    })

    it('fuzzy-matches a typo (jhon -> John Doe)', () => {
      const john = c({ id: 'j', name: 'John Doe' })
      const sally = c({ id: 's', name: 'Sally Smith' })
      const contacts = [john, sally]
      const fuse = buildContactsFuse(contacts, [])
      const result = searchContactsFuzzy('jhon', fuse, contacts)
      expect(result.map((r) => r.id)).toContain('j')
    })

    it('matches on a substring of a conversation note', () => {
      const target = c({ id: 't', name: 'Target Person' })
      const other = c({ id: 'o', name: 'Other Person' })
      const conversations: Conversation[] = [
        {
          id: 'conv1',
          contact: { id: target.id },
          date: moment().toDate(),
          isBibleStudy: false,
          note: 'discussed paradise hope',
        },
        {
          id: 'conv2',
          contact: { id: other.id },
          date: moment().toDate(),
          isBibleStudy: false,
          note: 'just said hello',
        },
      ]
      const contacts = [target, other]
      const fuse = buildContactsFuse(contacts, conversations)
      const result = searchContactsFuzzy('paradise', fuse, contacts)
      expect(result.map((r) => r.id)).toContain('t')
    })

    it('matches on a custom-field value (e.g. "Spanish")', () => {
      const spanish = c({
        id: 'sp',
        name: 'Maria',
        customFields: { language: 'Spanish' },
      })
      const french = c({
        id: 'fr',
        name: 'Pierre',
        customFields: { language: 'French' },
      })
      const contacts = [spanish, french]
      const fuse = buildContactsFuse(contacts, [])
      const result = searchContactsFuzzy('Spanish', fuse, contacts)
      expect(result.map((r) => r.id)).toContain('sp')
    })

    it('matches on the city field', () => {
      const cincy = c({
        id: 'cy',
        name: 'Cincy Person',
        address: { city: 'Cincinnati' },
      })
      const columbus = c({
        id: 'cb',
        name: 'Columbus Person',
        address: { city: 'Columbus' },
      })
      const contacts = [cincy, columbus]
      const fuse = buildContactsFuse(contacts, [])
      const result = searchContactsFuzzy('Cincinnati', fuse, contacts)
      expect(result.map((r) => r.id)).toContain('cy')
      expect(result[0].id).toBe('cy')
    })
  })
})
