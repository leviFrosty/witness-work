import { afterEach, describe, expect, it } from 'vitest'
import {
  appDigitSystem,
  appLanguage,
  formatNumber,
  formatPlainNumber,
  localizeAppDigits,
  numberFormatLocale,
  setNumberConventions,
} from '@/lib/numbers'

afterEach(() => setNumberConventions({ language: 'en-us' }))

describe('numberFormatLocale', () => {
  it('uses an explicit Format Region as is', () => {
    expect(numberFormatLocale({ language: 'en-us', region: 'de-ch' })).toBe(
      'de-ch'
    )
  })

  it("pairs the app Language with the device's region at Auto", () => {
    expect(numberFormatLocale({ language: 'en-us', deviceRegion: 'de' })).toBe(
      'en-DE'
    )
    expect(numberFormatLocale({ language: 'ar', deviceRegion: 'EG' })).toBe(
      'ar-EG'
    )
  })

  it('falls back to the Language alone', () => {
    expect(numberFormatLocale({ language: 'zh-hant-tw' })).toBe('zh')
  })
})

describe('formatNumber', () => {
  it('groups and rounds for Latin-digit Languages by their conventions', () => {
    setNumberConventions({ language: 'en-us', deviceRegion: 'US' })
    expect(formatNumber(1234.5)).toBe('1,234.5')
    setNumberConventions({ language: 'en-us', deviceRegion: 'DE' })
    expect(formatNumber(1234.5)).toBe('1.234,5')
    setNumberConventions({ language: 'de-de', region: 'de-ch' })

    expect(formatNumber(1234.5)).toMatch(/^1\S234\.5$/)
    setNumberConventions({ language: 'ru-ru', deviceRegion: 'RU' })
    expect(formatNumber(1234.5)).toMatch(/^1\s234,5$/)
  })

  it('keeps Latin digits for Latin-digit Languages in an Arabic-digit region', () => {
    for (const region of ['ar', 'ar-EG', 'ar-SA', 'fa']) {
      setNumberConventions({ language: 'en-us', region })
      expect(formatNumber(1234.5)).toMatch(/^1\D?234\.5$/)
      expect(formatNumber(7)).toBe('7')
    }
    setNumberConventions({ language: 'en-us', deviceRegion: 'EG' })
    expect(formatNumber(1234.5)).toBe('1,234.5')
  })

  it('caches the digit system with the conventions', () => {
    setNumberConventions({ language: 'ar' })
    expect(appDigitSystem()).toBe('arab')
    setNumberConventions({ language: 'en-us', region: 'ar' })
    expect(appDigitSystem()).toBe('latn')
  })

  it('writes Arabic with Arabic-Indic digits and separators, whatever the region', () => {
    for (const region of [undefined, 'en', 'de']) {
      setNumberConventions({ language: 'ar', region, deviceRegion: 'US' })
      expect(formatNumber(1234.5)).toBe('١٬٢٣٤٫٥')
      expect(formatNumber(0.25, { maximumFractionDigits: 1 })).toBe('٠٫٣')
    }
  })

  it('passes Intl options through', () => {
    setNumberConventions({ language: 'ar' })
    expect(
      formatNumber(4.5, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ).toBe('٤٫٥٠')
    expect(formatNumber(12.5, { style: 'currency', currency: 'USD' })).toBe(
      '$١٢٫٥٠'
    )
  })

  it('survives a locale tag Intl rejects', () => {
    setNumberConventions({ language: 'en-us', region: 'not a tag!' })
    expect(formatNumber(1234)).toBe('1,234')
  })
})

describe('formatPlainNumber', () => {
  it('never groups, so years read right', () => {
    setNumberConventions({ language: 'en-us', deviceRegion: 'US' })
    expect(formatPlainNumber(2026)).toBe('2026')
    setNumberConventions({ language: 'ar' })
    expect(formatPlainNumber(2026)).toBe('٢٠٢٦')
    expect(formatPlainNumber(1.5)).toBe('١٫٥')
  })
})

describe('app Language', () => {
  it('reports the digits the app Language writes', () => {
    expect(appLanguage()).toBe('en-us')
    expect(appDigitSystem()).toBe('latn')
    setNumberConventions({ language: 'ar' })
    expect(appDigitSystem()).toBe('arab')
    expect(localizeAppDigits('12:30')).toBe('١٢:٣٠')
  })
})
