import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  return { default: new I18n({ en }, { locale: 'en' }) }
})

import {
  contactRowAccessibilityLabel,
  previewText,
} from '@/features/contacts/lib/contactRowLabel'

describe('contactRowAccessibilityLabel', () => {
  it('reads the name, then each detail of the second line with a pause', () => {
    expect(
      contactRowAccessibilityLabel({
        name: 'Jane Doe',
        subtitle: '3 weeks ago · Springfield',
        study: null,
        favorite: false,
      })
    ).toBe('Jane Doe, 3 weeks ago, Springfield')
  })

  it('adds the study and favorite icons in the order the row shows them', () => {
    expect(
      contactRowAccessibilityLabel({
        name: 'Jane Doe',
        subtitle: 'Follow-up today · 12 Oak Street',
        study: 'active',
        favorite: true,
      })
    ).toBe(
      'Jane Doe, Follow-up today, 12 Oak Street, Bible study this month, Favorite'
    )
    expect(
      contactRowAccessibilityLabel({
        name: 'Jane Doe',
        subtitle: 'No Recent Conversations',
        study: 'past',
        favorite: false,
      })
    ).toBe('Jane Doe, No Recent Conversations, Past Bible study')
  })

  it('skips an empty second line', () => {
    expect(
      contactRowAccessibilityLabel({
        name: 'Jane Doe',
        subtitle: '',
        study: null,
        favorite: true,
      })
    ).toBe('Jane Doe, Favorite')
  })
})

describe('previewText', () => {
  it('windows a long field around the match, with ellipses', () => {
    const value = `${'a'.repeat(40)}bible${'b'.repeat(40)}`
    expect(previewText({ value, indices: [[40, 44]] }, 5)).toBe(
      '…aaaaabiblebbbbb…'
    )
  })

  it('reads a short field whole', () => {
    expect(previewText({ value: '555-0100', indices: [[0, 2]] }, 24)).toBe(
      '555-0100'
    )
    expect(previewText({ value: 'Spanish', indices: [] }, 24)).toBe('Spanish')
  })
})
