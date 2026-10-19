import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/locales'
import {
  FAQEntry,
  FAQS,
  faqCategoriesFor,
  faqsForPlatform,
} from '@/features/updates/constants/faqs'
import { searchFAQsFuzzy } from '@/features/updates/lib/faqSearch'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const { default: esES } = await import('@/locales/es-ES.json')
  // A stand-in Arabic FAQ entry: the real ar.json arrives with Arabic.
  const ar = {
    faq_darkMode_q: 'كيف أُفعِّل الوضعَ الداكنَ؟',
    faq_darkMode_a: 'اختر المظهر من الإعدادات.',
  }
  const translations = new I18n({ 'en-us': enUS, 'es-es': esES, ar })
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
      expect(searchFAQsFuzzy(query, 'en-us', 'ios')).toEqual(
        faqsForPlatform('ios')
      )
      expect(i18n.t).not.toHaveBeenCalled()
    }
  )

  it.each(['widgets', 'WIDGETS', '  widgets  ', 'widg', 'widgtes'])(
    'ranks the relevant question first for %j',
    (query) => {
      expect(searchFAQsFuzzy(query, 'en-us', 'ios')[0].id).toBe('widgets')
    }
  )

  it('finds a term appearing only in an answer', () => {
    expect(searchFAQsFuzzy('plain-text summary', 'en-us', 'ios')[0].id).toBe(
      'submitReport'
    )
  })

  it('returns no results for unrelated text', () => {
    expect(searchFAQsFuzzy('zzzzzzzzzz', 'en-us', 'ios')).toEqual([])
  })

  it('searches the selected language and refreshes when it changes', () => {
    expect(searchFAQsFuzzy('modo oscuro', 'es-es', 'ios')[0].id).toBe(
      'darkMode'
    )
    expect(searchFAQsFuzzy('dark mode', 'en-us', 'ios')[0].id).toBe('darkMode')
    expect(searchFAQsFuzzy('modo oscuro', 'en-us', 'ios')).toEqual([])
  })

  it('matches Arabic with or without harakat and across alef forms', () => {
    expect(searchFAQsFuzzy('الوضع الداكن', 'ar', 'ios')[0].id).toBe('darkMode')
    expect(searchFAQsFuzzy('اُفعّل', 'ar', 'ios')[0].id).toBe('darkMode')
    expect(searchFAQsFuzzy('الإعدادات', 'ar', 'ios')[0].id).toBe('darkMode')
  })

  it('reuses translations across successive searches and clearing', () => {
    searchFAQsFuzzy('modo oscuro', 'es-es', 'ios')
    searchFAQsFuzzy('widgets', 'en-us', 'ios')
    vi.mocked(i18n.t).mockClear()

    searchFAQsFuzzy('widgtes', 'en-us', 'ios')
    searchFAQsFuzzy('', 'en-us', 'ios')
    searchFAQsFuzzy('Hourglass', 'en-us', 'ios')

    expect(i18n.t).not.toHaveBeenCalled()
  })

  it('searches only the FAQs for the current platform', () => {
    const ios = searchFAQsFuzzy('watch', 'en-us', 'ios').map((e) => e.id)
    const android = searchFAQsFuzzy('watch', 'en-us', 'android').map(
      (e) => e.id
    )
    expect(ios).toContain('appleWatch')
    expect(ios).not.toContain('wearOs')
    expect(android).toContain('wearOs')
    expect(android).not.toContain('appleWatch')

    expect(searchFAQsFuzzy('sync', 'en-us', 'ios').map((e) => e.id)).toEqual(
      expect.not.arrayContaining(['googleDriveSync'])
    )
    expect(
      searchFAQsFuzzy('sync', 'en-us', 'android').map((e) => e.id)
    ).toEqual(expect.not.arrayContaining(['iCloudSync', 'syncTroubleshooting']))
    expect(searchFAQsFuzzy('widgets', 'en-us', 'android')[0]?.id).not.toBe(
      'widgets'
    )
  })
})

describe('FAQ platforms', () => {
  it('keeps shared entries and drops the other platform', () => {
    for (const platform of ['ios', 'android'] as const) {
      const shown = faqsForPlatform(platform)
      expect(shown).toEqual(
        FAQS.filter((e) => !e.platform || e.platform === platform)
      )
      expect(shown.some((e) => e.id === 'darkMode')).toBe(true)
    }
    const android = faqsForPlatform('android').map((e) => e.id)
    expect(android).not.toEqual(
      expect.arrayContaining(['iCloudSync', 'appleWatch', 'siri', 'widgets'])
    )
    expect(android).toEqual(
      expect.arrayContaining(['wearOs', 'googleDriveSync'])
    )
    const ios = faqsForPlatform('ios').map((e) => e.id)
    expect(ios).not.toContain('wearOs')
    expect(ios).not.toContain('googleDriveSync')
  })

  it('pins a sync question on each platform', () => {
    expect(
      faqsForPlatform('ios')
        .filter((e) => e.pinned)
        .map((e) => e.id)
    ).toContain('iCloudSync')
    expect(
      faqsForPlatform('android')
        .filter((e) => e.pinned)
        .map((e) => e.id)
    ).toContain('googleDriveSync')
  })

  it('drops categories with no entries on the platform', () => {
    const entries: FAQEntry[] = [
      { id: 'a', category: 'time' },
      { id: 'b', category: 'map', platform: 'ios' },
      { id: 'c', category: 'general', platform: 'android' },
    ]
    const shown = entries.filter((e) => !e.platform || e.platform === 'ios')
    expect(faqCategoriesFor(shown)).toEqual(['time', 'map'])
    expect(faqCategoriesFor([])).toEqual([])
    expect(faqCategoriesFor(faqsForPlatform('android'))).toContain('general')
  })
})
