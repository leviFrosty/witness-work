import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  return { default: new I18n({ en }, { locale: 'en' }) }
})

import { visitCardAccessibilityLabel } from '@/features/contacts/lib/visitCardLabel'

const base = {
  day: 'Mon, Oct 19',
  time: '10:00 AM',
  outcome: 'conversation' as const,
  note: '',
  fields: [],
}

describe('visitCardAccessibilityLabel', () => {
  it('reads the day, the time and the note', () => {
    expect(
      visitCardAccessibilityLabel({ ...base, note: ' Talked about family ' })
    ).toBe('Mon, Oct 19, 10:00 AM, Talked about family')
  })

  it('names a study before the note', () => {
    expect(
      visitCardAccessibilityLabel({
        ...base,
        outcome: 'study',
        note: 'Lesson 3',
      })
    ).toBe('Mon, Oct 19, 10:00 AM, Bible Study, Lesson 3')
  })

  it('says no one answered for a Not at Home without a note', () => {
    expect(visitCardAccessibilityLabel({ ...base, outcome: 'notAtHome' })).toBe(
      'Mon, Oct 19, 10:00 AM, No one answered.'
    )
    expect(
      visitCardAccessibilityLabel({
        ...base,
        outcome: 'notAtHome',
        note: 'Left a tract',
      })
    ).toBe('Mon, Oct 19, 10:00 AM, Left a tract')
  })

  it('ends with the custom fields and their labels', () => {
    expect(
      visitCardAccessibilityLabel({
        ...base,
        fields: [
          { label: 'Topic', value: 'Hope' },
          { label: 'Scripture', value: 'Ps 37:29' },
        ],
      })
    ).toBe('Mon, Oct 19, 10:00 AM, Topic: Hope, Scripture: Ps 37:29')
  })
})
