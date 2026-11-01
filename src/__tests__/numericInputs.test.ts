import { afterEach, describe, expect, it } from 'vitest'
import {
  formatCurrency,
  formatEditableNumber,
  formatFuelPrice,
  formatInputNumber,
  formatNumber,
  parseDecimal,
} from '@/lib/mileage/units'
import { setNumberConventions } from '@/lib/numbers'

afterEach(() => setNumberConventions({ language: 'en-us' }))

describe('numeric input in any digit system', () => {
  it('mileage fields read Arabic-Indic and Persian digits', () => {
    expect(parseDecimal('١٢')).toBe(12)
    expect(parseDecimal('١٢٫٥')).toBe(12.5)
    expect(parseDecimal('۱۲٫۵')).toBe(12.5)
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(parseDecimal('')).toBeUndefined()
    expect(parseDecimal('١٢x')).toBeUndefined()
  })
})

describe('mileage numbers in Arabic', () => {
  it('prefills inputs in the digits the keyboard types, and reads them back', () => {
    setNumberConventions({ language: 'ar' })
    expect(formatEditableNumber(12.46, 1)).toBe('١٢٫٥')
    expect(parseDecimal(formatEditableNumber(12.46, 1))).toBe(12.5)
  })

  it('keeps the CSV export in ASCII', () => {
    setNumberConventions({ language: 'ar' })
    expect(formatInputNumber(1234.567, 2)).toBe('1234.57')
  })

  it('formats distances and money with Arabic digits', () => {
    setNumberConventions({ language: 'ar' })
    expect(formatNumber(1234.56)).toBe('١٬٢٣٤٫٦')
    expect(formatCurrency(12.5, 'USD')).toBe('$١٢٫٥٠')
    expect(formatFuelPrice(3.499, 'USD')).toBe('$٣٫٤٩٩')
  })

  it('keeps Latin digits elsewhere', () => {
    setNumberConventions({ language: 'en-us', deviceRegion: 'US' })
    expect(formatNumber(1234.56)).toBe('1,234.6')
    expect(formatCurrency(12.5, 'USD')).toBe('$12.50')
    expect(formatEditableNumber(12.46, 1)).toBe('12.5')
  })

  it('falls back to a plain number for an unknown currency code', () => {
    setNumberConventions({ language: 'en-us', deviceRegion: 'US' })
    expect(formatCurrency(12.5, 'not-a-code')).toBe('12.50')
  })
})
