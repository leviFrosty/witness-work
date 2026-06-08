import { describe, expect, it } from 'vitest'
import {
  findContactIndexById,
  reconcileActiveContact,
  resolveCarouselSnapContact,
} from '@/features/map/lib/mapCarousel'
import { ContactMarker } from '@/features/map/types/map'

const marker = (id: string): ContactMarker =>
  ({ id, name: id, createdAt: new Date(), pinColor: '#fff' }) as ContactMarker

describe('lib/mapCarousel', () => {
  describe('findContactIndexById', () => {
    it('returns the index of the matching id', () => {
      const markers = [marker('a'), marker('b'), marker('c')]
      expect(findContactIndexById(markers, 'a')).toBe(0)
      expect(findContactIndexById(markers, 'b')).toBe(1)
      expect(findContactIndexById(markers, 'c')).toBe(2)
    })

    it('returns -1 when id is missing', () => {
      const markers = [marker('a'), marker('b')]
      expect(findContactIndexById(markers, 'missing')).toBe(-1)
    })

    it('returns -1 for undefined id', () => {
      const markers = [marker('a')]
      expect(findContactIndexById(markers, undefined)).toBe(-1)
    })

    it('returns -1 on empty list', () => {
      expect(findContactIndexById([], 'a')).toBe(-1)
    })
  })

  describe('reconcileActiveContact', () => {
    it('keeps the same active contact when nothing changed', () => {
      const markers = [marker('a'), marker('b'), marker('c')]
      const result = reconcileActiveContact({
        previousActiveId: 'b',
        previousIndex: 1,
        nextContactMarkers: markers,
      })
      expect(result).toEqual({ activeId: 'b', index: 1 })
    })

    /**
     * Reproduces the "tap pin, wrong card" symptom: an upstream change (a
     * contact dismissed/inserted before the active one) reorders the list, but
     * the active contact must still resolve to the correct new index.
     */
    it('updates the index when contacts are inserted before the active one', () => {
      const next = [marker('x'), marker('a'), marker('b'), marker('c')]
      const result = reconcileActiveContact({
        previousActiveId: 'b',
        previousIndex: 1, // stale: was correct before the insert
        nextContactMarkers: next,
      })
      expect(result.activeId).toBe('b')
      expect(result.index).toBe(2)
    })

    it('updates the index when contacts are removed before the active one', () => {
      const next = [marker('b'), marker('c')]
      const result = reconcileActiveContact({
        previousActiveId: 'c',
        previousIndex: 2, // stale: there are now only 2 items
        nextContactMarkers: next,
      })
      expect(result.activeId).toBe('c')
      expect(result.index).toBe(1)
    })

    /**
     * Reproduces the "card highlighted does not match pin" symptom for the
     * removal case: the active contact disappeared (e.g. dismissed). We need to
     * pick a deterministic neighbour rather than scrolling past the end.
     */
    it('falls back to the clamped previous index when the active contact is removed', () => {
      const next = [marker('a'), marker('c')]
      const result = reconcileActiveContact({
        previousActiveId: 'b',
        previousIndex: 1,
        nextContactMarkers: next,
      })
      expect(result.activeId).toBe('c')
      expect(result.index).toBe(1)
    })

    it('clamps the fallback index when the list shrinks past the previous index', () => {
      const next = [marker('a')]
      const result = reconcileActiveContact({
        previousActiveId: 'gone',
        previousIndex: 4,
        nextContactMarkers: next,
      })
      expect(result.activeId).toBe('a')
      expect(result.index).toBe(0)
    })

    it('returns no active contact when the list becomes empty', () => {
      const result = reconcileActiveContact({
        previousActiveId: 'a',
        previousIndex: 0,
        nextContactMarkers: [],
      })
      expect(result.activeId).toBeUndefined()
      expect(result.index).toBe(-1)
    })

    it('selects a fresh active contact when none was set', () => {
      const next = [marker('a'), marker('b')]
      const result = reconcileActiveContact({
        previousActiveId: undefined,
        previousIndex: 0,
        nextContactMarkers: next,
      })
      expect(result.activeId).toBe('a')
      expect(result.index).toBe(0)
    })

    /**
     * The captured-closure bug: render N saw `[a, b, c]` and bound the second
     * marker's onPress to `index = 1`. Before the user tapped, render N+1
     * produced `[x, a, b, c]`. The legacy code scrolled to index 1 (= "a"), not
     * the marker the user actually tapped ("b"). With id-based lookup this
     * can't happen.
     */
    it('id-based lookup survives the captured-index closure scenario', () => {
      const renderN = [marker('a'), marker('b'), marker('c')]
      const renderNPlus1 = [marker('x'), marker('a'), marker('b'), marker('c')]
      const tappedId = renderN[1].id // user tapped "b"
      const staleIndex = 1 // what a captured closure would carry

      // legacy behaviour (positional): would scroll to "a", not "b"
      expect(renderNPlus1[staleIndex].id).toBe('a')

      // id-based behaviour: scrolls to the right contact
      expect(findContactIndexById(renderNPlus1, tappedId)).toBe(2)
    })
  })

  describe('resolveCarouselSnapContact', () => {
    it('uses the snapped carousel index when there is no pending marker tap', () => {
      const markers = [marker('contact1'), marker('contact2')]

      expect(
        resolveCarouselSnapContact({
          contactMarkers: markers,
          snappedIndex: 1,
          pendingMarkerId: undefined,
        })
      ).toEqual({ activeId: 'contact2', index: 1 })
    })

    it('keeps the marker-tap contact when the carousel reports a stale snap index', () => {
      const markers = [marker('contact1'), marker('contact2')]

      expect(
        resolveCarouselSnapContact({
          contactMarkers: markers,
          snappedIndex: 0,
          pendingMarkerId: 'contact2',
        })
      ).toEqual({ activeId: 'contact2', index: 1 })
    })

    it('falls back to the snapped index when the pending marker is gone', () => {
      const markers = [marker('contact1'), marker('contact2')]

      expect(
        resolveCarouselSnapContact({
          contactMarkers: markers,
          snappedIndex: 0,
          pendingMarkerId: 'deleted',
        })
      ).toEqual({ activeId: 'contact1', index: 0 })
    })

    it('returns undefined when neither pending marker nor snapped index resolves', () => {
      expect(
        resolveCarouselSnapContact({
          contactMarkers: [],
          snappedIndex: 0,
          pendingMarkerId: 'contact2',
        })
      ).toBeUndefined()
    })
  })
})
