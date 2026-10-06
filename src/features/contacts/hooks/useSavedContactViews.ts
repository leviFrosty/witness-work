import { usePreferences } from '@/stores/preferences'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import useContactsQuery from '@/features/contacts/hooks/useContactsQuery'
import {
  DEFAULT_CONTACTS_QUERY,
  addSavedView,
  deleteSavedView,
  moveSavedView,
  orderedSavedViews,
  renameSavedView,
  savedViewAnalyticsSort,
  updateSavedViewQuery,
} from '@/features/contacts/lib/savedViews'

/**
 * Saved Views (Supporter feature): the ordered list plus every way to create,
 * switch, update, rename, reorder and delete them. Saving needs access; without
 * it the views stay stored but `useContactsQuery` doesn't apply them.
 */
export function useSavedContactViews() {
  const views = usePreferences((s) => s.savedContactViews)
  const setPreferences = usePreferences((s) => s.set)
  const { hasAccess } = useFeatureAccess('savedContactViews')
  const { query, view: activeView, edited, accessKnown } = useContactsQuery()

  const ordered = orderedSavedViews(views)

  /** Shows a view, or the User's own filters again for `null`. */
  const select = (id: string | null) => {
    if (!hasAccess) return
    setPreferences({ activeSavedContactView: id ? { id } : null })
    if (id)
      analytics.capture('saved_view_applied', { view_count: ordered.length })
  }

  /**
   * Saves what the list shows now as a new view and switches to it. Coming from
   * the User's own filters, those reset — they became the view, so leaving it
   * shows every contact again.
   */
  const saveCurrent = (name: string): boolean => {
    if (!hasAccess) return false
    const added = addSavedView(views, name, query)
    if (!added) return false
    setPreferences({
      savedContactViews: added.views,
      activeSavedContactView: { id: added.id },
      ...(activeView
        ? {}
        : {
            contactsFilters: DEFAULT_CONTACTS_QUERY.filters,
            contactSort: DEFAULT_CONTACTS_QUERY.sort,
            contactSortDirection: DEFAULT_CONTACTS_QUERY.direction,
          }),
    })
    analytics.capture('saved_view_created', {
      filter_count: query.filters.length,
      sort: savedViewAnalyticsSort(query),
      view_count: ordered.length + 1,
    })
    return true
  }

  /** Writes the active view's edits back to it. */
  const updateActive = () => {
    if (!hasAccess || !activeView || !edited) return
    setPreferences({
      savedContactViews: updateSavedViewQuery(views, activeView.id, query),
      activeSavedContactView: { id: activeView.id },
    })
  }

  const rename = (id: string, name: string) => {
    if (!hasAccess) return
    const next = renameSavedView(views, id, name)
    if (next !== views) setPreferences({ savedContactViews: next })
  }

  const move = (id: string, direction: -1 | 1) => {
    if (!hasAccess) return
    const next = moveSavedView(views, id, direction)
    if (next !== views) setPreferences({ savedContactViews: next })
  }

  const remove = (id: string) => {
    if (!hasAccess || !(id in views)) return
    setPreferences({
      savedContactViews: deleteSavedView(views, id),
      ...(activeView?.id === id ? { activeSavedContactView: null } : {}),
    })
  }

  /** Deletes after confirming. Only the view goes; contacts stay as they are. */
  const confirmRemove = (id: string) => {
    const view = views[id]
    if (!hasAccess || !view) return
    confirmDestructive({
      title: i18n.t('savedViews_delete_title', { name: view.name }),
      description: i18n.t('savedViews_delete_description'),
      onConfirm: () => remove(id),
    })
  }

  return {
    views: ordered,
    hasAccess,
    /** Kept after a lapse but no longer applied; false until access is known. */
    locked: accessKnown && !hasAccess,
    activeView,
    edited,
    select,
    saveCurrent,
    updateActive,
    rename,
    move,
    confirmRemove,
  }
}

export default useSavedContactViews
