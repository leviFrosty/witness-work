import { usePreferences } from '@/stores/preferences'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import useContactsQuery from '@/features/contacts/hooks/useContactsQuery'
import {
  DEFAULT_CONTACTS_QUERY,
  addSavedView,
  deleteSavedView,
  moveSavedView,
  orderedSavedViews,
  renameSavedView,
  reorderSavedViews,
  savedViewAnalyticsSort,
  updateSavedViewQuery,
} from '@/features/contacts/lib/savedViews'

export function useSavedContactViews() {
  const views = usePreferences((s) => s.savedContactViews)
  const setPreferences = usePreferences((s) => s.set)
  const { query, view: activeView, edited } = useContactsQuery()

  const ordered = orderedSavedViews(views)

  const select = (id: string | null, source?: 'list' | 'map') => {
    setPreferences({ activeSavedContactView: id ? { id } : null })
    if (id)
      analytics.capture('saved_view_applied', {
        view_count: ordered.length,
        ...(source ? { source } : {}),
      })
  }

  const saveCurrent = (name: string): boolean => {
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

  const updateActive = () => {
    if (!activeView || !edited) return
    setPreferences({
      savedContactViews: updateSavedViewQuery(views, activeView.id, query),
      activeSavedContactView: { id: activeView.id },
    })
  }

  const rename = (id: string, name: string) => {
    const next = renameSavedView(views, id, name)
    if (next !== views) setPreferences({ savedContactViews: next })
  }

  const move = (id: string, direction: -1 | 1) => {
    const next = moveSavedView(views, id, direction)
    if (next !== views) setPreferences({ savedContactViews: next })
  }

  const reorder = (ids: string[]) => {
    const next = reorderSavedViews(views, ids)
    if (next !== views) setPreferences({ savedContactViews: next })
  }

  const remove = (id: string) => {
    if (!(id in views)) return
    setPreferences({
      savedContactViews: deleteSavedView(views, id),
      ...(activeView?.id === id ? { activeSavedContactView: null } : {}),
    })
  }

  const confirmRemove = (id: string) => {
    const view = views[id]
    if (!view) return
    confirmDestructive({
      title: i18n.t('savedViews_delete_title', { name: view.name }),
      description: i18n.t('savedViews_delete_description'),
      onConfirm: () => remove(id),
    })
  }

  return {
    views: ordered,
    activeView,
    edited,
    select,
    saveCurrent,
    updateActive,
    rename,
    move,
    reorder,
    confirmRemove,
  }
}

export default useSavedContactViews
