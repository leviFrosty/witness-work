import { _i18n } from '@/lib/locales'
import { searchFAQsFuzzy } from '@/features/updates/lib/faqSearch'

export default function useFAQSearch(search: string) {
  const query = search.trim()
  const matches = searchFAQsFuzzy(query, _i18n.locale)
  return { matches, isSearching: query.length > 0 }
}
