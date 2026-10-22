import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import * as Application from 'expo-application'
import { analytics } from '@/lib/analytics'
import { searchFAQsFuzzy } from '@/features/updates/lib/faqSearch'
import {
  mergeSearchResults,
  searchHelpRemote,
} from '@/features/updates/lib/helpCenter/remoteSearch'
import type { HelpEntry, HelpLocale } from '@/features/updates/types/helpCenter'

/** Typing pause before asking the search service (queries are billed). */
const REMOTE_DEBOUNCE_MS = 600

/**
 * Searches the Help Center. Results come from this device at once (Fuse.js, so
 * it works offline); when the search service answers in time for the same
 * query, its order (keyword + meaning) replaces them. While it hasn't,
 * `isWaitingForRemote` lets an empty list say it's still searching.
 */
export default function useFAQSearch(
  search: string,
  entries: HelpEntry[],
  locale: HelpLocale
) {
  const query = search.trim()
  const local = searchFAQsFuzzy(query, entries)
  const [remote, setRemote] = useState<{
    query: string
    entries: HelpEntry[]
    slugs: string[] | null
  } | null>(null)

  useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void searchHelpRemote(
        {
          query,
          locale,
          platform: Platform.OS,
          appVersion: Application.nativeApplicationVersion,
        },
        { signal: controller.signal }
      ).then((slugs) => {
        if (controller.signal.aborted) return
        setRemote({ query, entries, slugs })
        const merged = mergeSearchResults(
          slugs,
          entries,
          searchFAQsFuzzy(query, entries)
        )
        analytics.capture('help_center_search_completed', {
          source: merged.source,
          outcome: merged.results.length ? 'results' : 'no_results',
        })
      })
    }, REMOTE_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, entries, locale])

  // Remote results count only for the query (and entry list) they answered.
  const settled =
    remote !== null && remote.query === query && remote.entries === entries
  const current = settled ? remote.slugs : null
  const { results, source } = mergeSearchResults(current, entries, local)
  return {
    matches: query ? results : entries,
    source,
    isSearching: query.length > 0,
    /** The search service hasn't answered this query yet. */
    isWaitingForRemote: query.length > 0 && !settled,
  }
}
