import moment from 'moment'
import { describe, expect, it } from 'vitest'
import {
  buildContactsFuse,
  buildSnippet,
  matchSourceForKey,
  pickPreviewMatch,
  searchContactsFuzzy,
} from '@/lib/contactsSearch'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'

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
      expect(result.map((r) => r.contact)).toEqual(contacts)
      expect(result.every((r) => r.matches === undefined)).toBe(true)
    })

    it('returns input unchanged when query is only whitespace', () => {
      const a = c({ id: 'a', name: 'Alice' })
      const b = c({ id: 'b', name: 'Bob' })
      const contacts = [a, b]
      const fuse = buildContactsFuse(contacts, [])
      const result = searchContactsFuzzy('   \t  ', fuse, contacts)
      expect(result.map((r) => r.contact)).toEqual(contacts)
    })

    it('returns the contact for an exact name match', () => {
      const alice = c({ id: 'a', name: 'Alice Wonderland' })
      const bob = c({ id: 'b', name: 'Bob Builder' })
      const contacts = [alice, bob]
      const fuse = buildContactsFuse(contacts, [])
      const result = searchContactsFuzzy('Alice Wonderland', fuse, contacts)
      expect(result.map((r) => r.contact.id)).toContain('a')
      expect(result[0].contact.id).toBe('a')
    })

    it('attaches match indices for the matched key', () => {
      const john = c({ id: 'j', name: 'John Johnson' })
      const fuse = buildContactsFuse([john], [])
      const result = searchContactsFuzzy('Johnson', fuse, [john])
      expect(result).toHaveLength(1)
      const matches = result[0].matches
      expect(matches).toBeDefined()
      const nameMatch = matches?.find((m) => m.key === 'contact.name')
      expect(nameMatch).toBeDefined()
      expect(nameMatch?.indices.length).toBeGreaterThan(0)
    })

    it('fuzzy-matches a typo (jhon -> John Doe)', () => {
      const john = c({ id: 'j', name: 'John Doe' })
      const sally = c({ id: 's', name: 'Sally Smith' })
      const contacts = [john, sally]
      const fuse = buildContactsFuse(contacts, [])
      const result = searchContactsFuzzy('jhon', fuse, contacts)
      expect(result.map((r) => r.contact.id)).toContain('j')
    })

    it('answers a repeated query from its last search, with the same results', () => {
      const john = c({ id: 'j', name: 'John Doe' })
      const joan = c({ id: 'n', name: 'Joan Doe' })
      const sally = c({ id: 's', name: 'Sally Smith' })
      const contacts = [john, joan, sally]
      const fuse = buildContactsFuse(contacts, [])

      const first = searchContactsFuzzy('jo', fuse, contacts)

      expect(searchContactsFuzzy('jo ', fuse, contacts)).toBe(first)
      expect(first).toEqual(
        searchContactsFuzzy('jo', buildContactsFuse(contacts, []), contacts)
      )

      const next = searchContactsFuzzy('john', fuse, contacts)
      expect(next).not.toBe(first)
      expect(next[0].contact.id).toBe('j')
      const fewer = [john, sally]
      expect(searchContactsFuzzy('john', fuse, fewer)).not.toBe(next)
    })

    it('matches on a substring of a conversation note', () => {
      const target = c({ id: 't', name: 'Target Person' })
      const other = c({ id: 'o', name: 'Other Person' })
      const conversations: Visit[] = [
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
      expect(result.map((r) => r.contact.id)).toContain('t')
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
      expect(result.map((r) => r.contact.id)).toContain('sp')
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
      expect(result.map((r) => r.contact.id)).toContain('cy')
      expect(result[0].contact.id).toBe('cy')
    })

    it('matches on the street address', () => {
      const elm = c({
        id: 'elm',
        name: 'Elm Neighbor',
        address: { line1: '42 Juniper Lane' },
      })
      const oak = c({
        id: 'oak',
        name: 'Oak Neighbor',
        address: { line1: '7 Harbor Road' },
      })
      const contacts = [elm, oak]
      const fuse = buildContactsFuse(contacts, [])
      const result = searchContactsFuzzy('juniper', fuse, contacts)
      expect(result.map((r) => r.contact.id)).toEqual(['elm'])
      expect(matchSourceForKey(result[0].matches?.[0]?.key)).toBe('address')
    })

    it('hands back the same objects it was given, extra fields and all', () => {
      const pins = [
        { ...c({ id: 'p', name: 'Pinned Person' }), pinColor: '#ff0000' },
      ]
      const fuse = buildContactsFuse(pins, [])
      const [first] = searchContactsFuzzy('pinned', fuse, pins)
      expect(first.contact).toBe(pins[0])
      expect(first.contact.pinColor).toBe('#ff0000')
    })
  })

  describe('matchSourceForKey', () => {
    it('maps known keys', () => {
      expect(matchSourceForKey('contact.name')).toBe('name')
      expect(matchSourceForKey('notes')).toBe('note')
      expect(matchSourceForKey('customFieldValues')).toBe('customField')
      expect(matchSourceForKey('contact.phone')).toBe('phone')
      expect(matchSourceForKey('contact.email')).toBe('email')
      expect(matchSourceForKey('contact.address.city')).toBe('address')
      expect(matchSourceForKey('contact.address.state')).toBe('address')
    })

    it('returns undefined for unknown / missing keys', () => {
      expect(matchSourceForKey(undefined)).toBeUndefined()
      expect(matchSourceForKey('')).toBeUndefined()
      expect(matchSourceForKey('something.else')).toBeUndefined()
    })
  })

  describe('pickPreviewMatch', () => {
    it('returns undefined when only the name matched', () => {
      const matches = [
        { key: 'contact.name', indices: [[0, 3]], value: 'John' },
      ]
      expect(pickPreviewMatch(matches as never)).toBeUndefined()
    })

    it('prefers customField over note when both match', () => {
      const matches = [
        { key: 'notes', indices: [[0, 4]], value: 'hello world' },
        {
          key: 'customFieldValues',
          indices: [[0, 4]],
          value: 'Spanish',
        },
      ]
      const picked = pickPreviewMatch(matches as never)
      expect(picked?.source).toBe('customField')
    })

    it('falls through to address only when nothing better matched', () => {
      const matches = [
        { key: 'contact.address.city', indices: [[0, 3]], value: 'Reno' },
      ]
      const picked = pickPreviewMatch(matches as never)
      expect(picked?.source).toBe('address')
    })

    it('returns undefined when matches is empty', () => {
      expect(pickPreviewMatch([])).toBeUndefined()
      expect(pickPreviewMatch(undefined)).toBeUndefined()
    })
  })

  describe('buildSnippet', () => {
    it('returns a single non-highlighted segment when no indices match', () => {
      const result = buildSnippet('hello world', [])
      expect(result.segments).toEqual([
        { text: 'hello world', highlighted: false },
      ])
      expect(result.truncatedStart).toBe(false)
      expect(result.truncatedEnd).toBe(false)
    })

    it('splits text into highlighted + non-highlighted segments', () => {
      const result = buildSnippet('hello WORLD foo', [[6, 10]])
      expect(result.segments).toEqual([
        { text: 'hello ', highlighted: false },
        { text: 'WORLD', highlighted: true },
        { text: ' foo', highlighted: false },
      ])
      expect(result.truncatedStart).toBe(false)
      expect(result.truncatedEnd).toBe(false)
    })

    it('windows around the first match when contextChars is set', () => {
      const padding = 'a'.repeat(80)
      const text = `${padding}Johnson${padding}`
      const start = padding.length
      const end = start + 'Johnson'.length - 1
      const result = buildSnippet(text, [[start, end]], 12)
      expect(result.truncatedStart).toBe(true)
      expect(result.truncatedEnd).toBe(true)

      const highlighted = result.segments.find((s) => s.highlighted)
      expect(highlighted?.text).toBe('Johnson')

      const total = result.segments.map((s) => s.text).join('')
      expect(total.length).toBeLessThanOrEqual(12 + 7 + 12)
    })

    it('drops single-character index ranges as noise', () => {
      const result = buildSnippet('hello world', [[4, 4]])
      expect(result.segments).toEqual([
        { text: 'hello world', highlighted: false },
      ])
    })

    it('handles multiple non-overlapping matches in the same window', () => {
      const text = 'Johnson and Johnson'
      const result = buildSnippet(text, [
        [0, 6],
        [12, 18],
      ])
      const highlighted = result.segments.filter((s) => s.highlighted)
      expect(highlighted.map((s) => s.text)).toEqual(['Johnson', 'Johnson'])
    })
  })

  describe('Arabic', () => {
    const mohammed = c({ id: 'm', name: 'مُحَمَّد الأحمد' })
    const fatima = c({ id: 'f', name: 'فاطمة إبراهيم' })
    const mustafa = c({ id: 's', name: 'مصطفى علي' })
    const contacts = [mohammed, fatima, mustafa]
    const fuse = buildContactsFuse(contacts, [])
    const firstId = (query: string) =>
      searchContactsFuzzy(query, fuse, contacts)[0]?.contact.id

    it('finds voweled names from a plain query, and the reverse', () => {
      expect(firstId('محمد')).toBe('m')
      expect(firstId('فَاطِمَة')).toBe('f')
    })

    it('treats alef forms, ta marbuta and alef maqsura as one letter', () => {
      expect(firstId('الاحمد')).toBe('m')
      expect(firstId('فاطمه ابراهيم')).toBe('f')
      expect(firstId('مصطفي')).toBe('s')
    })

    it('highlights the stored spelling, harakat included', () => {
      const [result] = searchContactsFuzzy('محمد', fuse, contacts)
      const nameMatch = result.matches?.find((m) => m.key === 'contact.name')
      expect(nameMatch?.value).toBe('مُحَمَّد الأحمد')
      const snippet = buildSnippet(nameMatch!.value!, nameMatch!.indices)
      const highlighted = snippet.segments
        .filter((segment) => segment.highlighted)
        .map((segment) => segment.text)
      expect(highlighted[0]).toBe('مُحَمَّد')
    })

    it('finds Latin-digit numbers from Arabic-Indic and Persian digits', () => {
      const ada = c({ id: 'a', name: 'Ada Reyes', phone: '0551234567' })
      const omar = c({
        id: 'o',
        name: 'عمر',
        address: { line1: 'شارع ٢٣', zip: '11564' },
      })
      const people = [ada, omar]
      const digits = buildContactsFuse(people, [])
      const search = (query: string) =>
        searchContactsFuzzy(query, digits, people)
      expect(search('٠٥٥١')[0]?.contact.id).toBe('a')
      expect(search('۰۵۵۱')[0]?.contact.id).toBe('a')
      expect(search('١١٥٦٤')[0]?.contact.id).toBe('o')

      const phone = search('٠٥٥١')[0].matches?.find(
        (m) => m.key === 'contact.phone'
      )
      expect(phone?.value).toBe('0551234567')
      expect(phone?.indices).toContainEqual([0, 3])
    })

    it('highlights stored Arabic-Indic digits from a Latin-digit query', () => {
      const omar = c({ id: 'o', name: 'عمر', phone: '٠٥٥١٢٣٤٥٦٧' })
      const fuse = buildContactsFuse([omar], [])
      const [result] = searchContactsFuzzy('0551', fuse, [omar])
      const phone = result.matches?.find((m) => m.key === 'contact.phone')
      expect(phone?.value).toBe('٠٥٥١٢٣٤٥٦٧')
      const snippet = buildSnippet(phone!.value!, phone!.indices)
      expect(
        snippet.segments.filter((s) => s.highlighted).map((s) => s.text)
      ).toEqual(['٠٥٥١'])
    })

    it('leaves Latin highlighting as it was', () => {
      const ada = c({ id: 'a', name: 'Ada Reyes' })
      const latin = buildContactsFuse([ada], [])
      const [result] = searchContactsFuzzy('Ada', latin, [ada])
      const nameMatch = result.matches?.find((m) => m.key === 'contact.name')
      expect(nameMatch?.value).toBe('Ada Reyes')
      expect(nameMatch?.indices).toContainEqual([0, 2])
    })
  })
})
