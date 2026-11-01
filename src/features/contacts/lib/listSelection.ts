export const toggleId = (
  selected: ReadonlySet<string>,
  id: string
): Set<string> => {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export const visibleSelection = (
  selected: ReadonlySet<string>,
  listIds: readonly string[]
): string[] => listIds.filter((id) => selected.has(id))

export const isAllSelected = (
  selected: ReadonlySet<string>,
  listIds: readonly string[]
) => listIds.length > 0 && listIds.every((id) => selected.has(id))

export const toggleAll = (
  selected: ReadonlySet<string>,
  listIds: readonly string[]
): Set<string> =>
  isAllSelected(selected, listIds) ? new Set() : new Set(listIds)
