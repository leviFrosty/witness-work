import { ContactMarker } from '@/features/map/types/map'

/**
 * Returns the index of the contact with the given id in `contactMarkers`, or
 * `-1` if it is not present.
 */
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

/**
 * After `contactMarkers` changes, decide which contact should remain selected.
 *
 * The active contact is identified by id, not index, so it survives reorders,
 * insertions, and removals. If the previously-active contact is gone, we fall
 * back to the contact that previously preceded it (clamped to the new bounds);
 * if the list is empty, no contact is active.
 *
 * @returns The new active contact id and its index, or `undefined`/`-1` if the
 *   list is empty.
 */
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

/**
 * Resolve the Contact selected by a carousel snap.
 *
 * Marker taps kick off an animated carousel scroll, but the carousel can report
 * a stale snap index at animation end. When a marker tap is pending, the marker
 * id is the source of truth; otherwise the carousel index is trusted.
 */
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
