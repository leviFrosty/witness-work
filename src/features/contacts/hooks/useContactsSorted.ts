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

  const search = useSearchQuery()

  const actives = useMemo(() => filterActivesContacts(contacts), [contacts])

  const conversationIndex = useConversationIndex(
    conversations,
    stalenessBreakpoints
  )

  const hasSearch = search.trim().length > 0

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

  const searchSortedAndFilteredContacts = useMemo(
    () => (hasSearch ? filtered : [...filtered].sort(comparator)),
    [filtered, comparator, hasSearch]
  )

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
