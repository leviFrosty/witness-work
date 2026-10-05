import { describe, expect, it } from 'vitest'
import { hasSensitiveCustomFieldText } from './sensitiveCustomFields'

describe('custom field privacy hints', () => {
  it.each([
    'ETHNICITY',
    'Religious beliefs',
    'Church',
    'Health conditions',
    'Medical history',
    'Marital status',
    'Family situation',
    'Mother-tongue',
    'Native_language',
    'National origin',
    'Catholic',
    'Diabetes',
    'Spanish',
    'Single   parent',
    'ＡＳＩＡＮ',
  ])('warns about %s', (text) => {
    expect(hasSensitiveCustomFieldText(text)).toBe(true)
  })

  it.each([
    '',
    'Best time',
    'Evenings',
    'Entrance',
    'Trace',
    'Kidstone',
    'Grace',
  ])('does not warn about unrelated text %s', (text) => {
    expect(hasSensitiveCustomFieldText(text)).toBe(false)
  })
})
