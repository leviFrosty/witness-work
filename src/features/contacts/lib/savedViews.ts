import * as Crypto from 'expo-crypto'
import { canonicalJson } from '@/lib/canonicalJson'
import { syncTimestamp } from '@/lib/syncClock'
import type { ActiveFilter } from '@/lib/contactsFilters'
import type { ContactSortKey } from '@/lib/contactsSort'
import type { CustomFieldDefinition } from '@/types/customField'
import type {
  ActiveSavedContactView,
  ContactsQuery,
  SavedContactView,
} from '@/types/savedContactView'

export type SavedContactViews = Record<string, SavedContactView>
export type SavedContactViewEntry = SavedContactView & { id: string }

export const DEFAULT_CONTACTS_QUERY: ContactsQuery = {
  filters: [],
  sort: 'suggested',
  direction: 'desc',
}

/** Long enough for "Spanish territory", short enough to keep chips scannable. */
export const SAVED_VIEW_NAME_MAX_LENGTH = 30

const CUSTOM_FIELD_SORT_PREFIX = 'customField:'

const pickContactsQuery = ({
  filters,
  sort,
  direction,
}: ContactsQuery): ContactsQuery => ({ filters, sort, direction })

export const isDefaultContactsQuery = (query: ContactsQuery): boolean =>
  sameContactsQuery(query, DEFAULT_CONTACTS_QUERY)

const sameContactsQuery = (a: ContactsQuery, b: ContactsQuery) =>
  canonicalJson(pickContactsQuery(a)) === canonicalJson(pickContactsQuery(b))

export const normalizeSavedViewName = (name: string): string =>
  name.trim().slice(0, SAVED_VIEW_NAME_MAX_LENGTH)

/** Chip-row order. Ties fall back to creation, then id, so devices agree. */
export function orderedSavedViews(
  views: SavedContactViews
): SavedContactViewEntry[] {
  return Object.entries(views)
    .map(([id, view]) => ({ ...view, id }))
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id)
    )
}

/**
 * Points every custom-field reference at a field that still exists. Renamed and
 * archived fields keep their id (and archived ones keep their values), so they
 * need nothing. Ids merged by the legacy definition cleanup resolve to their
 * canonical definition. A permanently deleted field's values are gone, so its
 * filters are dropped and a sort on it falls back to Suggested. Returns the
 * same object when nothing changed.
 */
export function resolveCustomFieldReferences(
  query: ContactsQuery,
  customFieldDefs: CustomFieldDefinition[]
): ContactsQuery {
  const canonical = new Map<string, string>()
  for (const def of customFieldDefs)
    for (const legacyId of def.legacyIds ?? []) canonical.set(legacyId, def.id)
  for (const def of customFieldDefs) canonical.set(def.id, def.id)

  let changed = false
  const filters = query.filters.flatMap((filter): ActiveFilter[] => {
    if (filter.kind !== 'customField') return [filter]
    const defId = canonical.get(filter.defId)
    if (defId === filter.defId) return [filter]
    changed = true
    return defId ? [{ ...filter, defId }] : []
  })

  let sort = query.sort
  if (sort.startsWith(CUSTOM_FIELD_SORT_PREFIX)) {
    const defId = canonical.get(sort.slice(CUSTOM_FIELD_SORT_PREFIX.length))
    const resolved = defId
      ? (`${CUSTOM_FIELD_SORT_PREFIX}${defId}` as const)
      : DEFAULT_CONTACTS_QUERY.sort
    if (resolved !== sort) {
      sort = resolved
      changed = true
    }
  }

  return changed ? { ...query, filters, sort } : query
}

type ResolvedContactsQuery = {
  /** What the Contacts list shows. */
  query: ContactsQuery
  /** The Saved View being shown, when one is active and the User has access. */
  view: SavedContactViewEntry | null
  /** The view's filters or sort changed and haven't been saved back to it. */
  edited: boolean
}

/**
 * The single rule for what the Contacts list applies. Without access (a lapsed
 * Supporter), the active view is ignored rather than cleared — like a custom
 * accent color, the data stays and the effect returns with access.
 */
/** A view's own filters and sort, with its field references resolved. */
const savedViewQuery = (
  saved: SavedContactView,
  customFieldDefs: CustomFieldDefinition[]
) => resolveCustomFieldReferences(pickContactsQuery(saved), customFieldDefs)

export function resolveContactsQuery({
  own,
  views,
  active,
  hasAccess,
  customFieldDefs,
}: {
  /** The User's own filters and sort, used whenever no view applies. */
  own: ContactsQuery
  views: SavedContactViews
  active: ActiveSavedContactView | null
  hasAccess: boolean
  customFieldDefs: CustomFieldDefinition[]
}): ResolvedContactsQuery {
  const saved = hasAccess && active ? views[active.id] : undefined
  if (!active || !saved) {
    return {
      query: resolveCustomFieldReferences(own, customFieldDefs),
      view: null,
      edited: false,
    }
  }
  const view = { ...saved, id: active.id }
  const savedQuery = savedViewQuery(saved, customFieldDefs)
  if (!active.edits) return { query: savedQuery, view, edited: false }
  const query = resolveCustomFieldReferences(active.edits, customFieldDefs)
  return { query, view, edited: !sameContactsQuery(query, savedQuery) }
}

/** Records changes to the active view; matching the saved view clears them. */
export function editActiveSavedView(
  view: SavedContactViewEntry,
  next: ContactsQuery,
  customFieldDefs: CustomFieldDefinition[]
): ActiveSavedContactView {
  return sameContactsQuery(next, savedViewQuery(view, customFieldDefs))
    ? { id: view.id }
    : { id: view.id, edits: pickContactsQuery(next) }
}

/** Appends a view at the end of the row. `null` for an empty name. */
export function addSavedView(
  views: SavedContactViews,
  name: string,
  query: ContactsQuery,
  id: string = Crypto.randomUUID()
): { views: SavedContactViews; id: string } | null {
  const trimmed = normalizeSavedViewName(name)
  if (!trimmed) return null
  const order = Math.max(-1, ...Object.values(views).map((view) => view.order))
  return {
    id,
    views: {
      ...views,
      [id]: {
        ...pickContactsQuery(query),
        name: trimmed,
        order: order + 1,
        createdAt: syncTimestamp(),
      },
    },
  }
}

export function renameSavedView(
  views: SavedContactViews,
  id: string,
  name: string
): SavedContactViews {
  const trimmed = normalizeSavedViewName(name)
  const view = views[id]
  if (!view || !trimmed || trimmed === view.name) return views
  return { ...views, [id]: { ...view, name: trimmed } }
}

export function updateSavedViewQuery(
  views: SavedContactViews,
  id: string,
  query: ContactsQuery
): SavedContactViews {
  const view = views[id]
  if (!view) return views
  return { ...views, [id]: { ...view, ...pickContactsQuery(query) } }
}

export function deleteSavedView(
  views: SavedContactViews,
  id: string
): SavedContactViews {
  if (!(id in views)) return views
  const { [id]: _deleted, ...rest } = views
  return rest
}

/**
 * Moves a view one place earlier (`-1`) or later (`1`). Rewrites `order` only
 * on views whose position changed, so sync stamps just those entries.
 */
export function moveSavedView(
  views: SavedContactViews,
  id: string,
  direction: -1 | 1
): SavedContactViews {
  const ordered = orderedSavedViews(views).map((view) => view.id)
  const index = ordered.indexOf(id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= ordered.length) return views
  ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
  const next = { ...views }
  ordered.forEach((viewId, order) => {
    if (next[viewId].order !== order) next[viewId] = { ...next[viewId], order }
  })
  return next
}

/** Bounded analytics context: a built-in sort key, or just `customField`. */
export const savedViewAnalyticsSort = (
  query: ContactsQuery
): Exclude<ContactSortKey, `customField:${string}`> | 'customField' =>
  query.sort.startsWith(CUSTOM_FIELD_SORT_PREFIX)
    ? 'customField'
    : (query.sort as Exclude<ContactSortKey, `customField:${string}`>)
