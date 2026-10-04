import { useState } from 'react'

import {
  isAllSelected,
  toggleAll,
  toggleId,
  visibleSelection,
} from '@/features/contacts/lib/listSelection'

/**
 * Select mode state for a list screen: entering and leaving it, which rows are
 * checked.
 *
 * `listIds` is the list as currently shown; selected ids that drop out of it no
 * longer count.
 */
export default function useListSelection(listIds: readonly string[]) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const ids = visibleSelection(selected, listIds)

  /**
   * Enters Select mode, optionally with one row already checked (the row's
   * long-press "Select").
   */
  const start = (initialId?: string) => {
    setSelected(new Set(initialId ? [initialId] : []))
    setSelecting(true)
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
  }
}

export type ListSelection = ReturnType<typeof useListSelection>
