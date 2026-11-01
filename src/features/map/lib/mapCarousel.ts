import { ContactMarker } from '@/features/map/types/map'

export function findContactIndexById(
  contactMarkers: Pick<ContactMarker, 'id'>[],
  id: string | undefined
): number {
  if (!id) return -1
  for (let i = 0; i < contactMarkers.length; i++) {
    if (contactMarkers[i].id === id) return i
  }
  return -1
}

export function reconcileActiveContact(params: {
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

export function resolveCarouselSnapContact(params: {
  contactMarkers: Pick<ContactMarker, 'id'>[]
  snappedIndex: number
  pendingMarkerId: string | undefined
}): { activeId: string; index: number } | undefined {
  const { contactMarkers, snappedIndex, pendingMarkerId } = params

  const pendingIndex = findContactIndexById(contactMarkers, pendingMarkerId)
  if (pendingIndex >= 0 && pendingMarkerId) {
    return { activeId: pendingMarkerId, index: pendingIndex }
  }

  const snappedContact = contactMarkers[snappedIndex]
  if (!snappedContact) return undefined

  return { activeId: snappedContact.id, index: snappedIndex }
}
