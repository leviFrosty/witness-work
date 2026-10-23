import { describe, expect, it } from 'vitest'
import { helpBundle, helpEntry } from '@/__tests__/helpers/helpCenterFixture'
import { searchFAQsFuzzy } from '@/features/updates/lib/faqSearch'
import { visibleEntries } from '@/features/updates/lib/helpCenter/visibility'

const english = visibleEntries(helpBundle(), 'ios', '4.0.0')
const android = visibleEntries(helpBundle(), 'android', '4.0.0')
const spanish = [
  helpEntry(
    'darkMode',
    '¿Cómo activo el modo oscuro?',
    'Elige el tema en Ajustes.'
  ),
]
// A stand-in Arabic entry with harakat in the text.
const arabic = [
  helpEntry(
    'darkMode',
    'كيف أُفعِّل الوضعَ الداكنَ؟',
    'اختر المظهر من الإعدادات.'
  ),
]

describe('FAQ search', () => {
  it.each(['', '   \t  '])(
    'keeps FAQ order for a blank query (%j)',
    (query) => {
      expect(searchFAQsFuzzy(query, english)).toBe(english)
    }
  )

  it.each(['widgets', 'WIDGETS', '  widgets  ', 'widg', 'widgtes'])(
    'ranks the relevant question first for %j',
    (query) => {
      expect(searchFAQsFuzzy(query, english)[0].id).toBe('widgets')
    }
  )

  it('finds a term appearing only in an answer', () => {
    expect(searchFAQsFuzzy('plain-text summary', english)[0].id).toBe(
      'submitReport'
    )
  })

  it('returns no results for unrelated text', () => {
    expect(searchFAQsFuzzy('zzzzzzzzzz', english)).toEqual([])
  })

  it('searches the entries it is given, in their language', () => {
    expect(searchFAQsFuzzy('modo oscuro', spanish)[0].id).toBe('darkMode')
    expect(searchFAQsFuzzy('modo oscuro', english)).toEqual([])
  })

  it('matches Arabic with or without harakat and across alef forms', () => {
    expect(searchFAQsFuzzy('الوضع الداكن', arabic)[0].id).toBe('darkMode')
    expect(searchFAQsFuzzy('اُفعّل', arabic)[0].id).toBe('darkMode')
    expect(searchFAQsFuzzy('الإعدادات', arabic)[0].id).toBe('darkMode')
  })

  it('searches only the entries shown on this platform', () => {
    expect(searchFAQsFuzzy('wear os', english)).toEqual([])
    expect(searchFAQsFuzzy('wear os', android)[0].id).toBe('wearOs')
    expect(searchFAQsFuzzy('widgets', android)[0]?.id).not.toBe('widgets')
  })
})
