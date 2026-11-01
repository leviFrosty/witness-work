import { describe, expect, it } from 'vitest'
import {
  contactCustomFieldHistory,
  customFieldSuggestions as suggestFromIndex,
  customFieldValueIndex,
} from '@/features/visits/lib/customFieldSuggestions'
import type { Visit } from '@/types/visit'

const FIELD = 'literature'

const visit = (
  id: string,
  contactId: string,
  date: string,
  value?: string,
  otherFields: Record<string, string> = {}
): Visit => ({
  id,
  contact: { id: contactId },
  date: new Date(date),
  isBibleStudy: false,
  customFields: {
    ...otherFields,
    ...(value === undefined ? {} : { [FIELD]: value }),
  },
})

const customFieldSuggestions = (
  visits: readonly Visit[],
  fieldId: string,
  query: string,
  { excludeVisitId, limit }: { excludeVisitId?: string; limit?: number } = {}
) =>
  suggestFromIndex(
    customFieldValueIndex(visits, fieldId, { excludeVisitId }),
    query,
    { limit }
  )

describe('customFieldSuggestions', () => {
  const visits = [
    visit('1', 'a', '2026-01-01', 'Enjoy Life Forever'),
    visit('2', 'b', '2026-02-01', 'enjoy life forever '),
    visit('3', 'c', '2026-03-01', 'Was Life Created?'),
    visit('4', 'a', '2026-04-01', 'Real Faith video'),
    visit('5', 'b', '2026-05-01', 'Was Life Created?'),
    visit('6', 'c', '2026-06-01', 'Enjoy  Life Forever'),
    visit('7', 'd', '2026-07-01', undefined, { other: 'Not this field' }),
    visit('8', 'd', '2026-08-01', '   '),
  ]

  it('ranks by use count, then most recent, deduping case-insensitively', () => {
    expect(customFieldSuggestions(visits, FIELD, '')).toEqual([
      'Enjoy  Life Forever',
      'Was Life Created?',
      'Real Faith video',
    ])
  })

  it('keeps the most recently used spelling', () => {
    const [first] = customFieldSuggestions(
      [
        visit('1', 'a', '2026-02-01', 'WATCHTOWER'),
        visit('2', 'a', '2026-01-01', 'watchtower'),
      ],
      FIELD,
      ''
    )
    expect(first).toBe('WATCHTOWER')
  })

  it('breaks count ties by recency', () => {
    expect(
      customFieldSuggestions(
        [
          visit('1', 'a', '2026-01-01', 'Older'),
          visit('2', 'a', '2026-03-01', 'Newer'),
        ],
        FIELD,
        ''
      )
    ).toEqual(['Newer', 'Older'])
  })

  it('filters by what is typed, ignoring case', () => {
    expect(customFieldSuggestions(visits, FIELD, 'LIFE')).toEqual([
      'Enjoy  Life Forever',
      'Was Life Created?',
    ])
    expect(customFieldSuggestions(visits, FIELD, 'video')).toEqual([
      'Real Faith video',
    ])
  })

  it('drops a value that already matches what is typed', () => {
    expect(customFieldSuggestions(visits, FIELD, 'real faith VIDEO')).toEqual(
      []
    )
  })

  it('skips the visit being edited', () => {
    expect(
      customFieldSuggestions(visits, FIELD, 'real', { excludeVisitId: '4' })
    ).toEqual([])
  })

  it('caps the list', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      visit(String(i), 'a', `2026-01-0${i + 1}`, `Tract ${i}`)
    )
    expect(customFieldSuggestions(many, FIELD, '')).toHaveLength(5)
    expect(customFieldSuggestions(many, FIELD, '', { limit: 2 })).toEqual([
      'Tract 8',
      'Tract 7',
    ])
  })

  it('returns nothing when the field has no history', () => {
    expect(customFieldSuggestions(visits, 'unknown', '')).toEqual([])
  })

  it('answers every keystroke from one index as a fresh one would', () => {
    const index = customFieldValueIndex(visits, FIELD, { excludeVisitId: '5' })
    for (const query of ['', 'e', 'en', 'ENJOY', 'life', 'was life created?']) {
      expect(suggestFromIndex(index, query)).toEqual(
        customFieldSuggestions(visits, FIELD, query, { excludeVisitId: '5' })
      )
    }
    expect(suggestFromIndex(index, 'life')).toEqual([
      'Enjoy  Life Forever',
      'Was Life Created?',
    ])
  })
})

describe('contactCustomFieldHistory', () => {
  const visits = [
    visit('1', 'a', '2026-01-01', 'Enjoy Life Forever'),
    visit('2', 'a', '2026-02-01', 'Was Life Created?'),
    visit('3', 'a', '2026-03-01', 'enjoy life forever'),
    visit('4', 'b', '2026-03-15', 'Real Faith video'),
    visit('5', 'a', '2026-04-01'),
    visit('6', 'a', '2026-05-01', 'Later tract'),
  ]

  it("lists the contact's earlier values, newest first and deduped", () => {
    expect(
      contactCustomFieldHistory(visits, {
        contactId: 'a',
        fieldId: FIELD,
        before: new Date('2026-04-15'),
      })
    ).toEqual(['enjoy life forever', 'Was Life Created?'])
  })

  it('leaves out the visit being edited and anything on or after it', () => {
    expect(
      contactCustomFieldHistory(visits, {
        contactId: 'a',
        fieldId: FIELD,
        before: new Date('2026-03-01'),
        excludeVisitId: '3',
      })
    ).toEqual(['Was Life Created?', 'Enjoy Life Forever'])
  })

  it('returns nothing without a contact', () => {
    expect(
      contactCustomFieldHistory(visits, {
        contactId: '',
        fieldId: FIELD,
        before: new Date('2027-01-01'),
      })
    ).toEqual([])
  })
})
