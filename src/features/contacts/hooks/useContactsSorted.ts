import { useMemo } from 'react'
import { FuseResultMatch } from 'fuse.js'
import useContacts from '../../../stores/contactsStore'
import useConversations from '../../../stores/conversationStore'
import { usePreferences } from '../../../stores/preferences'
import useContactsSearchStore from '../stores/contactsSearchStore'
import { applyFilters } from '../../../lib/contactsFilters'
import { buildContactComparator } from '../../../lib/contactsSort'
import { buildContactsFuse, searchContactsFuzzy } from '../lib/contactsSearch'
import { filterActivesContacts } from '../../../lib/dismissedContacts'

/**
 * Single source of truth for the active contacts pipeline. The Contacts tab and
 * the modal Search & Filter screen both need the same sorted result — this hook
 * runs the pipeline once per mount via `useMemo` chains so each call site stays
 * cheap.
 *
 * Reads everything from stores directly so consumers don't need to thread
 * dependencies through props.
 */
export function useContactsSorted() {
  const { contacts, customFieldDefs } = useContacts()
  const { conversations } = useConversations()
  const { contactSort, contactSortDirection, contactsFilters } =
    usePreferences()
  const search = useContactsSearchStore((s) => s.search)

  const actives = useMemo(() => filterActivesContacts(contacts), [contacts])

  const fuse = useMemo(
    () => buildContactsFuse(actives, conversations),
    [actives, conversations]
  )

  const searched = useMemo(
    () => searchContactsFuzzy(search, fuse, actives),
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
      }),
    [matchedContacts, contactsFilters, conversations, customFieldDefs]
  )

  const comparator = useMemo(
    () =>
      buildContactComparator(contactSort, contactSortDirection, {
        conversations,
        customFieldDefs,
      }),
    [contactSort, contactSortDirection, conversations, customFieldDefs]
  )

  const searchSortedAndFilteredContacts = useMemo(
    () => [...filtered].sort(comparator),
    [filtered, comparator]
  )

  return {
    searchSortedAndFilteredContacts,
    searchMatchesById,
    search,
    contactsFilters,
    customFieldDefs,
    contactSort,
    contactSortDirection,
    hasSearch: search.trim().length > 0,
    hasActiveFilters: contactsFilters.length > 0,
    isSortNonDefault:
      contactSort !== 'suggested' || contactSortDirection !== 'desc',
  }
}

export default useContactsSorted
