import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  digitSystemFor,
  isDigitsOnlyInput,
  localizeDigits,
  localizeNumeral,
  normalizeNumericInput,
  parseDecimalInput,
  parseIntegerInput,
  RLM,
  toAsciiDigits,
} from '@/lib/digits'

describe('digitSystemFor', () => {
  it('gives Arabic its Arabic-Indic digits, with or without a region', () => {
    expect(digitSystemFor('ar')).toBe('arab')
    expect(digitSystemFor('ar-EG')).toBe('arab')
    expect(digitSystemFor('AR_sa')).toBe('arab')
  })

  it('keeps Latin digits for every other shipped Language', () => {
    for (const locale of [
      'en-us',
      'de-de',
      'ru-ru',
      'ja-jp',
      'zh-hant-tw',
      'bem-zm',
      'rw-rw',
      'sw-ke',
      'uk-ua',
      'vi-vn',
    ])
      expect(digitSystemFor(locale)).toBe('latn')
    expect(digitSystemFor(undefined)).toBe('latn')
    expect(digitSystemFor('')).toBe('latn')
  })
})

describe('localizeDigits', () => {
  it('rewrites every Latin digit for Arabic', () => {
    expect(localizeDigits('0123456789', 'ar')).toBe('٠١٢٣٤٥٦٧٨٩')
    expect(localizeDigits('مت 16:23', 'ar')).toBe('مت ١٦:٢٣')
  })

  it('leaves separators and other text alone', () => {
    expect(localizeDigits('1,234.5h', 'ar')).toBe('١,٢٣٤.٥h')
  })

  it('is a no-op for Latin-digit Languages', () => {
    expect(localizeDigits('12-18 Oct', 'en-us')).toBe('12-18 Oct')
    expect(localizeDigits('12', 'ru-ru')).toBe('12')
  })
})

describe('localizeNumeral', () => {
  it('swaps the en-US decimal point and grouping for Arabic separators', () => {
    expect(localizeNumeral('1,234.5', 'ar')).toBe('١٬٢٣٤٫٥')
    expect(localizeNumeral('0.5', 'ar')).toBe('٠٫٥')
    expect(localizeNumeral('12', 'ar')).toBe('١٢')
  })

  it('only touches separators between digits', () => {
    expect(localizeNumeral('Done. 3, then 4.', 'ar')).toBe('Done. ٣, then ٤.')
  })

  it('is a no-op for Latin-digit Languages', () => {
    expect(localizeNumeral('1,234.5', 'de-de')).toBe('1,234.5')
  })
})

describe('toAsciiDigits', () => {
  it('maps Arabic-Indic and Persian digits to ASCII', () => {
    expect(toAsciiDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789')
    expect(toAsciiDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789')
    expect(toAsciiDigits('١٢ ساعة')).toBe('12 ساعة')
  })

  it('leaves ASCII and other text untouched', () => {
    expect(toAsciiDigits('12.5 Hrs')).toBe('12.5 Hrs')
  })

  it('round-trips localizeDigits', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const ascii = toAsciiDigits(text)
        expect(toAsciiDigits(localizeDigits(ascii, 'ar'))).toBe(ascii)
      })
    )
  })
})

describe('normalizeNumericInput', () => {
  it('turns Arabic separators and bidi marks into parseable ASCII', () => {
    expect(normalizeNumericInput('١٢٫٥')).toBe('12.5')
    expect(normalizeNumericInput('١٬٢٣٤')).toBe('1234')
    expect(normalizeNumericInput(`${RLM}١٢${RLM}`)).toBe('12')
    expect(normalizeNumericInput('١٢،٥')).toBe('12,5')
  })
})

describe('parseDecimalInput', () => {
  it('accepts every digit system and decimal separator', () => {
    expect(parseDecimalInput('12')).toBe(12)
    expect(parseDecimalInput('١٢')).toBe(12)
    expect(parseDecimalInput('۱۲')).toBe(12)
    expect(parseDecimalInput('1.5')).toBe(1.5)
    expect(parseDecimalInput('1,5')).toBe(1.5)
    expect(parseDecimalInput('١٫٥')).toBe(1.5)
    expect(parseDecimalInput('١,٥')).toBe(1.5)
    expect(parseDecimalInput('1٢.٥')).toBe(12.5)
    expect(parseDecimalInput(' 12 ')).toBe(12)
    expect(parseDecimalInput('.5')).toBe(0.5)
    expect(parseDecimalInput('5.')).toBe(5)
  })

  it('rejects blank, negative and malformed input', () => {
    for (const text of ['', ' ', '.', '-1', '1.2.3', 'abc', '1e3', '١٢x'])
      expect(parseDecimalInput(text)).toBeUndefined()
  })

  it('reads any non-negative number back from its localized digits', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        (value) => {
          const text = value.toFixed(2)
          expect(parseDecimalInput(localizeNumeral(text, 'ar'))).toBe(
            Number(text)
          )
        }
      )
    )
  })
})

describe('parseIntegerInput', () => {
  it('accepts Latin, Arabic-Indic and Persian digits', () => {
    expect(parseIntegerInput('42')).toBe(42)
    expect(parseIntegerInput('٤٢')).toBe(42)
    expect(parseIntegerInput('۴۲')).toBe(42)
    expect(parseIntegerInput(' ٤2 ')).toBe(42)
  })

  it('rejects blank, fractional and signed input', () => {
    for (const text of ['', '1.5', '١٫٥', '-3', '+3', 'x'])
      expect(parseIntegerInput(text)).toBeUndefined()
  })
})

describe('isDigitsOnlyInput', () => {
  it('passes digits in any system and blank', () => {
    expect(isDigitsOnlyInput('')).toBe(true)
    expect(isDigitsOnlyInput('120')).toBe(true)
    expect(isDigitsOnlyInput('١٢٠')).toBe(true)
  })

  it('fails anything else', () => {
    expect(isDigitsOnlyInput('1.5')).toBe(false)
    expect(isDigitsOnlyInput('١٫٥')).toBe(false)
    expect(isDigitsOnlyInput('a')).toBe(false)
  })
})
