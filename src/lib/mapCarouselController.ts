import { ContactMarker } from '../types/map'

export interface CarouselIntent {
  activeId: string | undefined
  index: number
  requiresScroll: boolean
}

export interface MapCarouselController {
  setContacts(list: ContactMarker[]): CarouselIntent
  select(id: string): CarouselIntent
  delete(id: string): CarouselIntent
  getActiveId(): string | undefined
  getActiveIndex(): number
}

function findContactIndexById(
  contactMarkers: Pick<ContactMarker, 'id'>[],
  id: string | undefined
): number {
  if (!id) return -1
  for (let i = 0; i < contactMarkers.length; i++) {
    if (contactMarkers[i].id === id) return i
  }
  return -1
}

function reconcileActiveContact(params: {
  previousActiveId: string | undefined
  previousIndex: number
  nextContactMarkers: Pick<ContactMarker, 'id'>[]
}): { activeId: string | undefined; index: number } {
  const { previousActiveId, previousIndex, nextContactMarkers } = params

  if (nextContactMarkers.length === 0) {
    return { activeId: undefined, index: -1 }
  }

  const idx = findContactIndexById(nextContactMarkers, previousActiveId)
  if (idx >= 0) {
    return { activeId: previousActiveId, index: idx }
  }

  const fallback = Math.max(
    0,
    Math.min(previousIndex, nextContactMarkers.length - 1)
  )
  return { activeId: nextContactMarkers[fallback].id, index: fallback }
}

export function createMapCarouselController(): MapCarouselController {
  let activeId: string | undefined
  let activeIndex = -1
  let contacts: ContactMarker[] = []

  const setContacts = (list: ContactMarker[]): CarouselIntent => {
    const previousActiveId = activeId
    const previousIndex = activeIndex
    const fallbackIndex = previousIndex < 0 ? 0 : previousIndex
    const reconciled = reconcileActiveContact({
      previousActiveId,
      previousIndex: fallbackIndex,
      nextContactMarkers: list,
    })

    contacts = list
    activeId = reconciled.activeId
    activeIndex = reconciled.index

    const requiresScroll =
      reconciled.index >= 0 &&
      previousActiveId !== undefined &&
      (reconciled.activeId !== previousActiveId ||
        reconciled.index !== previousIndex)

    return {
      activeId: reconciled.activeId,
      index: reconciled.index,
      requiresScroll,
    }
  }

  const select = (id: string): CarouselIntent => {
    const idx = findContactIndexById(contacts, id)
    if (idx < 0) {
      return {
        activeId,
        index: activeIndex,
        requiresScroll: false,
      }
    }
    activeId = id
    activeIndex = idx
    return { activeId: id, index: idx, requiresScroll: true }
  }

  const remove = (id: string): CarouselIntent => {
    const removedIndex = findContactIndexById(contacts, id)
    if (removedIndex < 0) {
      return { activeId, index: activeIndex, requiresScroll: false }
    }

    const next = contacts.filter((c) => c.id !== id)
    contacts = next

    if (next.length === 0) {
      activeId = undefined
      activeIndex = -1
      return { activeId: undefined, index: -1, requiresScroll: false }
    }

    if (id === activeId) {
      const fallback = Math.min(removedIndex, next.length - 1)
      activeId = next[fallback].id
      activeIndex = fallback
      return { activeId, index: fallback, requiresScroll: true }
    }

    const newIdx = findContactIndexById(next, activeId)
    activeIndex = newIdx
    return { activeId, index: newIdx, requiresScroll: false }
  }

  return {
    setContacts,
    select,
    delete: remove,
    getActiveId: () => activeId,
    getActiveIndex: () => activeIndex,
  }
}
