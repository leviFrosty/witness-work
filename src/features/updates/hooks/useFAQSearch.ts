import { useEffect } from 'react'
import { _i18n } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { searchFAQsFuzzy } from '@/features/updates/lib/faqSearch'

export default function useFAQSearch(search: string) {
  const query = search.trim()
  const matches = searchFAQsFuzzy(query, _i18n.locale)
  const resultCount = matches.length

  useEffect(() => {
    if (!query) return
    // Results update immediately; only analytics waits for a pause in typing.
    const timeout = setTimeout(() => {
      analytics.capture('faq_search_performed', { result_count: resultCount })
    }, 400)
    return () => clearTimeout(timeout)
  }, [query, resultCount])

  return { matches, isSearching: query.length > 0 }
}
