import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  foldArabicForSearch,
  foldArabicWithIndexMap,
  unfoldRange,
} from '@/lib/searchNormalize'

describe('foldArabicForSearch', () => {
  it('drops harakat and the tatweel', () => {
    expect(foldArabicForSearch('مُحَمَّد')).toBe('محمد')
    expect(foldArabicForSearch('كتـــاب')).toBe('كتاب')
    expect(foldArabicForSearch('الرَّحْمٰن')).toBe('الرحمن')
  })

  it('reads every alef form as a bare alef', () => {
    expect(foldArabicForSearch('أحمد')).toBe('احمد')
    expect(foldArabicForSearch('إبراهيم')).toBe('ابراهيم')
    expect(foldArabicForSearch('آمنة')).toBe('امنه')
    expect(foldArabicForSearch('ٱلله')).toBe('الله')
  })

  it('folds ta marbuta to ha and alef maqsura to ya', () => {
    expect(foldArabicForSearch('فاطمة')).toBe('فاطمه')
    expect(foldArabicForSearch('مصطفى')).toBe('مصطفي')
  })

  it('reads Arabic-Indic and Persian digits as 0-9', () => {
    expect(foldArabicForSearch('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789')
    expect(foldArabicForSearch('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789')
    expect(foldArabicForSearch('شارع ٢٣')).toBe('شارع 23')
    expect(foldArabicForSearch('0551 234')).toBe('0551 234')
  })

  it('leaves Latin, Cyrillic and CJK text unchanged', () => {
    for (const text of ['José Núñez', 'Ольга', '山田太郎', 'Zoë', ''])
      expect(foldArabicForSearch(text)).toBe(text)
  })

  it('leaves any text without Arabic letters unchanged', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        fc.pre(
          !/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
            text
          )
        )
        expect(foldArabicForSearch(text)).toBe(text)
      })
    )
  })

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (text) => {
        const once = foldArabicForSearch(text)
        expect(foldArabicForSearch(once)).toBe(once)
      })
    )
    const once = foldArabicForSearch('أَحْمَدُ فاطمة')
    expect(foldArabicForSearch(once)).toBe(once)
  })
})

describe('foldArabicWithIndexMap', () => {
  it('returns null when folding changes nothing', () => {
    expect(foldArabicWithIndexMap('Ada Reyes')).toBeNull()
    expect(foldArabicWithIndexMap('محمد')).toBeNull()
  })

  it('agrees with foldArabicForSearch', () => {
    const text = 'السيد مُحَمَّد أحمد'
    expect(foldArabicWithIndexMap(text)?.folded).toBe(foldArabicForSearch(text))
  })

  it('folds digits one for one, so ranges map straight back', () => {
    const text = 'هاتف ٠٥٥١٢٣'
    const map = foldArabicWithIndexMap(text)!
    expect(map.folded).toBe('هاتف 055123')
    expect(map.folded).toHaveLength(text.length)
    const [start, end] = unfoldRange([5, 8], map, text.length)
    expect(text.slice(start, end + 1)).toBe('٠٥٥١')
  })

  it('maps folded ranges back onto the source, keeping trailing harakat', () => {
    const text = 'مُحَمَّد علي'
    const map = foldArabicWithIndexMap(text)!

    expect(unfoldRange([0, 3], map, text.length)).toEqual([0, 7])

    const [start, end] = unfoldRange([5, 7], map, text.length)
    expect(text.slice(start, end + 1)).toBe('علي')
  })
})
