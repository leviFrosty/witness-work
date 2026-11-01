import { useState } from 'react'

import {
  isAllSelected,
  toggleAll,
  toggleId,
  visibleSelection,
} from '@/features/contacts/lib/listSelection'

export default function useListSelection(listIds: readonly string[]) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const ids = visibleSelection(selected, listIds)

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

    ids,

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
