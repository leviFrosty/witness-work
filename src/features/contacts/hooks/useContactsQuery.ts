import useContacts from '@/stores/contactsStore'
import { usePreferences } from '@/stores/preferences'
import type { ActiveFilter } from '@/lib/contactsFilters'
import type { ContactSortDirection, ContactSortKey } from '@/lib/contactsSort'
import type { ContactsQuery } from '@/types/savedContactView'
import {
  DEFAULT_CONTACTS_QUERY,
  editActiveSavedView,
  resolveContactsQuery,
} from '@/features/contacts/lib/savedViews'

export function useContactsQuery() {
  const contactsFilters = usePreferences((s) => s.contactsFilters)
  const contactSort = usePreferences((s) => s.contactSort)
  const contactSortDirection = usePreferences((s) => s.contactSortDirection)
  const views = usePreferences((s) => s.savedContactViews)
  const active = usePreferences((s) => s.activeSavedContactView)
  const setPreferences = usePreferences((s) => s.set)
  const customFieldDefs = useContacts((s) => s.customFieldDefs)

  const resolved = resolveContactsQuery({
    own: {
      filters: contactsFilters,
      sort: contactSort,
      direction: contactSortDirection,
    },
    views,
    active,
    customFieldDefs,
  })
  const { query, view } = resolved

  const editView = (next: ContactsQuery) => {
    if (!view) return
    setPreferences({
      activeSavedContactView: editActiveSavedView(view, next, customFieldDefs),
    })
  }

  const setFilters = (filters: ActiveFilter[]) => {
    if (view) editView({ ...query, filters })
    else setPreferences({ contactsFilters: filters })
  }
  const setSort = (sort: ContactSortKey) => {
    if (view) editView({ ...query, sort })
    else setPreferences({ contactSort: sort })
  }
  const setDirection = (direction: ContactSortDirection) => {
    if (view) editView({ ...query, direction })
    else setPreferences({ contactSortDirection: direction })
  }

  const reset = () => {
    if (view) {
      setPreferences({ activeSavedContactView: { id: view.id } })
      return
    }
    setPreferences({
      contactsFilters: DEFAULT_CONTACTS_QUERY.filters,
      contactSort: DEFAULT_CONTACTS_QUERY.sort,
      contactSortDirection: DEFAULT_CONTACTS_QUERY.direction,
    })
  }

  return {
    ...resolved,
    hasActiveFilters: query.filters.length > 0,
    isSortNonDefault:
      query.sort !== DEFAULT_CONTACTS_QUERY.sort ||
      query.direction !== DEFAULT_CONTACTS_QUERY.direction,
    setFilters,
    setSort,
    setDirection,
    reset,
  }
}

export default useContactsQuery
