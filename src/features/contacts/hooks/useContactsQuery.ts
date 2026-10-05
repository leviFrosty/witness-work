import useContacts from '@/stores/contactsStore'
import { usePreferences } from '@/stores/preferences'
import useCustomer from '@/hooks/useCustomer'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import type { ActiveFilter } from '@/lib/contactsFilters'
import type { ContactSortDirection, ContactSortKey } from '@/lib/contactsSort'
import type { ContactsQuery } from '@/types/savedContactView'
import {
  DEFAULT_CONTACTS_QUERY,
  editActiveSavedView,
  resolveContactsQuery,
} from '@/features/contacts/lib/savedViews'

/**
 * The filters and sort the Contacts list applies, and the setters the Sort &
 * Filter screen edits them through. While a Saved View is active, changes go to
 * that view's unsaved edits; otherwise to the User's own filters, which are
 * free for everyone.
 */
export function useContactsQuery() {
  const contactsFilters = usePreferences((s) => s.contactsFilters)
  const contactSort = usePreferences((s) => s.contactSort)
  const contactSortDirection = usePreferences((s) => s.contactSortDirection)
  const views = usePreferences((s) => s.savedContactViews)
  const active = usePreferences((s) => s.activeSavedContactView)
  const setPreferences = usePreferences((s) => s.set)
  const customFieldDefs = useContacts((s) => s.customFieldDefs)
  const { hasAccess } = useFeatureAccess('savedContactViews')
  const { customer, unavailable } = useCustomer()
  // Until RevenueCat answers, keep showing the active view so a Supporter's
  // list doesn't flash their own filters at launch (AppIconSync waits too).
  const accessKnown = hasAccess || customer !== null || unavailable

  const resolved = resolveContactsQuery({
    own: {
      filters: contactsFilters,
      sort: contactSort,
      direction: contactSortDirection,
    },
    views,
    active,
    hasAccess: hasAccess || !accessKnown,
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
  /** Back to the view as saved, or to no filters and the default sort. */
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
    accessKnown,
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
