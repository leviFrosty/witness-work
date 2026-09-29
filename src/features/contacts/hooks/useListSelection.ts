import { useState } from 'react'

import { analytics } from '@/lib/analytics'
import {
  isAllSelected,
  toggleAll,
  toggleId,
  visibleSelection,
} from '@/features/contacts/lib/listSelection'

/**
 * Select mode state for a list screen: entering and leaving it, which rows are
 * checked, and the documented `list_selection_*` analytics.
 *
 * `listIds` is the list as currently shown; selected ids that drop out of it no
 * longer count.
 */
export default function useListSelection(
  surface: string,
  listIds: readonly string[]
) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const ids = visibleSelection(selected, listIds)

  /**
   * Enters Select mode, optionally with one row already checked (the row's
   * long-press "Select"). `source` says where it was started from.
   */
  const start = (initialId?: string, source: 'menu' | 'row' = 'menu') => {
    setSelected(new Set(initialId ? [initialId] : []))
    setSelecting(true)
    analytics.capture('list_selection_started', { surface, source })
  }

  const finish = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  return {
    selecting,
    /** Selected ids still in the list, in list order. */
    ids,
    /**
     * The raw selection. A new Set on every change (including start and
     * finish), so it's a cheap `extraData` for lists that draw checkmarks.
     */
    selected,
    isSelected: (id: string) => selected.has(id),
    allSelected: isAllSelected(selected, listIds),
    start,
    finish,
    toggle: (id: string) => setSelected((current) => toggleId(current, id)),
    toggleAll: () => setSelected((current) => toggleAll(current, listIds)),
    /**
     * Records a batch action on the current selection. Call it when the action
     * actually runs (after any confirmation), then `finish()` if the action
     * ends Select mode.
     */
    track: (action: string, count = ids.length) =>
      analytics.capture('list_selection_action', { surface, action, count }),
  }
}

export type ListSelection = ReturnType<typeof useListSelection>
