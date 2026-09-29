/**
 * Pure helpers behind Select mode on list screens. Selection is a set of ids;
 * it is always read through `visibleSelection` so rows that leave the list
 * (filtered out, dismissed, deleted elsewhere) stop counting as selected.
 */

export const toggleId = (
  selected: ReadonlySet<string>,
  id: string
): Set<string> => {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** The selected ids still present in the list, in list order. */
export const visibleSelection = (
  selected: ReadonlySet<string>,
  listIds: readonly string[]
): string[] => listIds.filter((id) => selected.has(id))

/** True when every row in a non-empty list is selected. */
export const isAllSelected = (
  selected: ReadonlySet<string>,
  listIds: readonly string[]
) => listIds.length > 0 && listIds.every((id) => selected.has(id))

/** Select All, or clear when everything is already selected. */
export const toggleAll = (
  selected: ReadonlySet<string>,
  listIds: readonly string[]
): Set<string> =>
  isAllSelected(selected, listIds) ? new Set() : new Set(listIds)
