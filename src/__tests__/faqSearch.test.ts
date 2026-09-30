import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/locales'
import { FAQS } from '@/features/updates/constants/faqs'
import { searchFAQsFuzzy } from '@/features/updates/lib/faqSearch'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const { default: esES } = await import('@/locales/es-ES.json')
  const translations = new I18n({ 'en-us': enUS, 'es-es': esES })
  translations.defaultLocale = 'en-us'
  translations.enableFallback = true
  return {
    default: {
      t: vi.fn((key: string, options?: { locale: string }) =>
        translations.t(key, options)
      ),
    },
  }
})

describe('FAQ search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['', '   \t  '])(
    'keeps FAQ order for a blank query (%j)',
    (query) => {
      expect(searchFAQsFuzzy(query, 'en-us')).toBe(FAQS)
      expect(i18n.t).not.toHaveBeenCalled()
    }
  )

  it.each(['widgets', 'WIDGETS', '  widgets  ', 'widg', 'widgtes'])(
    'ranks the relevant question first for %j',
    (query) => {
      expect(searchFAQsFuzzy(query, 'en-us')[0].id).toBe('widgets')
    }
  )

  it('finds a term appearing only in an answer', () => {
    expect(searchFAQsFuzzy('Hourglass', 'en-us')[0].id).toBe('submitReport')
  })

  it('returns no results for unrelated text', () => {
    expect(searchFAQsFuzzy('zzzzzzzzzz', 'en-us')).toEqual([])
  })

  it('searches the selected language and refreshes when it changes', () => {
    expect(searchFAQsFuzzy('modo oscuro', 'es-es')[0].id).toBe('darkMode')
    expect(searchFAQsFuzzy('dark mode', 'en-us')[0].id).toBe('darkMode')
    expect(searchFAQsFuzzy('modo oscuro', 'en-us')).toEqual([])
  })

  it('reuses translations across successive searches and clearing', () => {
    searchFAQsFuzzy('modo oscuro', 'es-es')
    searchFAQsFuzzy('widgets', 'en-us')
    vi.mocked(i18n.t).mockClear()

    searchFAQsFuzzy('widgtes', 'en-us')
    searchFAQsFuzzy('', 'en-us')
    searchFAQsFuzzy('Hourglass', 'en-us')

    expect(i18n.t).not.toHaveBeenCalled()
  })
})
