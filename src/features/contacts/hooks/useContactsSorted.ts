import { startTransition, useEffect, useMemo, useState } from 'react'
import { FuseResultMatch } from 'fuse.js'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useContactsSearchStore from '@/features/contacts/stores/contactsSearchStore'
import useContactsQuery from '@/features/contacts/hooks/useContactsQuery'
import { applyFilters } from '@/lib/contactsFilters'
import { buildContactComparator } from '@/lib/contactsSort'
import {
  buildContactsFuse,
  ContactSearchMatch,
  searchContactsFuzzy,
} from '@/lib/contactsSearch'
import { filterActivesContacts } from '@/lib/dismissedContacts'
import useConversationIndex from '@/hooks/useConversationIndex'

/**
 * The query the results are for. The search field reads the store itself and
 * shows each letter as it's typed; this follows in a transition, so the search
 * and the long list it redraws render in the background, where the next
 * keystroke interrupts them, and typing never waits on them. A plain store
 * selector would re-render the whole screen synchronously on every keystroke.
 */
function useSearchQuery() {
  const [query, setQuery] = useState(
    () => useContactsSearchStore.getState().search
  )
  useEffect(() => {
    const follow = () =>
      startTransition(() => setQuery(useContactsSearchStore.getState().search))
    follow()
    return useContactsSearchStore.subscribe(follow)
  }, [])
  return query
}

/**
 * Single source of truth for the active contacts pipeline. The Contacts tab
 * (its list and its map) and the modal Search & Filter screen all need the same
 * sorted result — this hook runs the pipeline once per mount via `useMemo`
 * chains so each call site stays cheap. Filters and sort come from
 * `useContactsQuery`: the active Saved View, or the User's own.
 *
 * Reads everything from stores directly so consumers don't need to thread
 * dependencies through props.
 */
export function useContactsSorted() {
  const contacts = useContacts((s) => s.contacts)
  const customFieldDefs = useContacts((s) => s.customFieldDefs)
  const conversations = useConversations((s) => s.conversations)
  const stalenessBreakpoints = usePreferences((s) => s.stalenessBreakpoints)
  const { query, hasActiveFilters, isSortNonDefault } = useContactsQuery()
  const {
    filters: contactsFilters,
    sort: contactSort,
    direction: contactSortDirection,
  } = query
  // Trails the search field while the results for it render.
  const search = useSearchQuery()

  const actives = useMemo(() => filterActivesContacts(contacts), [contacts])

  // Single per-contact conversation index, shared with the comparator below and
  // handed down to the stats header and every row — so the whole screen scans
  // the conversations array once instead of once per contact. It rebuilds
  // when the tab stays mounted into a new day (so "this month" and the
  // staleness buckets move on) and when a Follow-up turns missed, so filters
  // and sort follow the clock.
  const conversationIndex = useConversationIndex(
    conversations,
    stalenessBreakpoints
  )

  const hasSearch = search.trim().length > 0

  // Built only while there's a query: the tab stays mounted, so an index keyed
  // on `conversations` would otherwise rebuild every time a visit is logged.
  const fuse = useMemo(
    () => (hasSearch ? buildContactsFuse(actives, conversations) : null),
    [hasSearch, actives, conversations]
  )

  const searched = useMemo<ContactSearchMatch[]>(
    () =>
      fuse
        ? searchContactsFuzzy(search, fuse, actives)
        : actives.map((contact) => ({ contact })),
    [search, fuse, actives]
  )

  const matchedContacts = useMemo(
    () => searched.map((r) => r.contact),
    [searched]
  )

  // Keyed lookup so the row renderer doesn't have to scan the search results
  // array for every item it draws. The map is empty when the query is empty —
  // every entry's `matches` is undefined in that case, so we skip them.
  const searchMatchesById = useMemo(() => {
    const map = new Map<string, readonly FuseResultMatch[]>()
    for (const r of searched) {
      if (r.matches && r.matches.length > 0) {
        map.set(r.contact.id, r.matches)
      }
    }
    return map
  }, [searched])

  const filtered = useMemo(
    () =>
      applyFilters(matchedContacts, contactsFilters, {
        conversations,
        customFieldDefs,
        stalenessBreakpoints,
        conversationIndex,
      }),
    [
      matchedContacts,
      contactsFilters,
      conversations,
      customFieldDefs,
      stalenessBreakpoints,
      conversationIndex,
    ]
  )

  const comparator = useMemo(
    () =>
      buildContactComparator(
        contactSort,
        contactSortDirection,
        { conversations, customFieldDefs },
        conversationIndex
      ),
    [
      contactSort,
      contactSortDirection,
      conversations,
      customFieldDefs,
      conversationIndex,
    ]
  )

  // With an active query, `filtered` is already in Fuse relevance order — the
  // best name match comes first. Applying the comparator here would discard that
  // ranking and re-sort by the default `suggested`/`desc` rule, which buries a
  // freshly-typed match (no conversations → missing-value sentinel sorts last)
  // at the bottom. Only sort when there is no query to rank by.
  const searchSortedAndFilteredContacts = useMemo(
    () => (hasSearch ? filtered : [...filtered].sort(comparator)),
    [filtered, comparator, hasSearch]
  )

  // The same filters and sort without the list's search, for the Map, which
  // has a search of its own. Without a query that's the list's result as is.
  const sortedAndFilteredContacts = useMemo(
    () =>
      hasSearch
        ? [
            ...applyFilters(actives, contactsFilters, {
              conversations,
              customFieldDefs,
              stalenessBreakpoints,
              conversationIndex,
            }),
          ].sort(comparator)
        : searchSortedAndFilteredContacts,
    [
      hasSearch,
      actives,
      contactsFilters,
      conversations,
      customFieldDefs,
      stalenessBreakpoints,
      conversationIndex,
      comparator,
      searchSortedAndFilteredContacts,
    ]
  )

  return {
    searchSortedAndFilteredContacts,
    sortedAndFilteredContacts,
    searchMatchesById,
    conversationIndex,
    search,
    contactsFilters,
    customFieldDefs,
    contactSort,
    contactSortDirection,
    hasSearch,
    hasActiveFilters,
    isSortNonDefault,
  }
}

export default useContactsSorted
