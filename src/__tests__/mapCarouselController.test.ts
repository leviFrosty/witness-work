import { describe, expect, it } from 'vitest'
import { createMapCarouselController } from '../lib/mapCarouselController'
import { ContactMarker } from '../types/map'

const marker = (id: string): ContactMarker =>
  ({ id, name: id, createdAt: new Date(), pinColor: '#fff' }) as ContactMarker

describe('lib/mapCarouselController', () => {
  describe('initial state', () => {
    it('starts with no active contact when constructed empty', () => {
      const controller = createMapCarouselController()
      expect(controller.getActiveId()).toBeUndefined()
      expect(controller.getActiveIndex()).toBe(-1)
    })
  })

  describe('setContacts', () => {
    it('selects the first contact when no contact was active', () => {
      const controller = createMapCarouselController()
      const result = controller.setContacts([marker('a'), marker('b')])
      expect(result.activeId).toBe('a')
      expect(result.index).toBe(0)
      expect(controller.getActiveId()).toBe('a')
      expect(controller.getActiveIndex()).toBe(0)
    })

    it('returns no active contact and clears state when list becomes empty', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b')])
      const result = controller.setContacts([])
      expect(result.activeId).toBeUndefined()
      expect(result.index).toBe(-1)
      expect(controller.getActiveId()).toBeUndefined()
      expect(controller.getActiveIndex()).toBe(-1)
    })
  })

  describe('select', () => {
    it('updates active contact and asks the adapter to scroll', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b'), marker('c')])
      const result = controller.select('c')
      expect(result.activeId).toBe('c')
      expect(result.index).toBe(2)
      expect(result.requiresScroll).toBe(true)
      expect(controller.getActiveId()).toBe('c')
      expect(controller.getActiveIndex()).toBe(2)
    })

    it('is a no-op when the id does not exist in the current contacts', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b')])
      const result = controller.select('missing')
      expect(result.activeId).toBe('a')
      expect(result.index).toBe(0)
      expect(result.requiresScroll).toBe(false)
    })
  })

  describe('delete', () => {
    it('removes the contact and picks the contact at its prior index', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b'), marker('c')])
      controller.select('b')
      const result = controller.delete('b')
      expect(result.activeId).toBe('c')
      expect(result.index).toBe(1)
      expect(result.requiresScroll).toBe(true)
      expect(controller.getActiveId()).toBe('c')
    })

    it('clamps to the last contact when the deleted item was at the end', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b'), marker('c')])
      controller.select('c')
      const result = controller.delete('c')
      expect(result.activeId).toBe('b')
      expect(result.index).toBe(1)
    })

    it('leaves no active contact when the last one is deleted', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a')])
      const result = controller.delete('a')
      expect(result.activeId).toBeUndefined()
      expect(result.index).toBe(-1)
      expect(controller.getActiveId()).toBeUndefined()
    })

    it('keeps the active contact when a different one is deleted', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b'), marker('c')])
      controller.select('c')
      const result = controller.delete('a')
      expect(result.activeId).toBe('c')
      expect(result.index).toBe(1)
    })
  })

  describe('list reorder and shrink', () => {
    it('keeps the active id stable when contacts are inserted before it', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b'), marker('c')])
      controller.select('b')
      const result = controller.setContacts([
        marker('x'),
        marker('a'),
        marker('b'),
        marker('c'),
      ])
      expect(result.activeId).toBe('b')
      expect(result.index).toBe(2)
      expect(result.requiresScroll).toBe(true)
      expect(controller.getActiveId()).toBe('b')
      expect(controller.getActiveIndex()).toBe(2)
    })

    it('requests a scroll when the active contact disappeared and a fallback is picked', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b'), marker('c')])
      controller.select('b')
      const result = controller.setContacts([marker('a'), marker('c')])
      expect(result.activeId).toBe('c')
      expect(result.index).toBe(1)
      expect(result.requiresScroll).toBe(true)
    })

    it('does not request a scroll when a reconcile leaves the active index unchanged', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b'), marker('c')])
      controller.select('b')
      const result = controller.setContacts([
        marker('a'),
        marker('b'),
        marker('c'),
        marker('d'),
      ])
      expect(result.activeId).toBe('b')
      expect(result.index).toBe(1)
      expect(result.requiresScroll).toBe(false)
    })

    it('clamps to last item when the list shrinks past the active index', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b'), marker('c')])
      controller.select('c')
      const result = controller.setContacts([marker('a')])
      expect(result.activeId).toBe('a')
      expect(result.index).toBe(0)
    })

    it('drops the active contact when the new list is empty', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b')])
      controller.select('b')
      const result = controller.setContacts([])
      expect(result.activeId).toBeUndefined()
      expect(result.index).toBe(-1)
    })

    /**
     * Captured-closure bug: render N showed [a, b, c] and the user tapped pin
     * "b". Before the tap reaches us, render N+1 produced [x, a, b, c]. With
     * id-based select() the carousel still scrolls to the right contact.
     */
    it('scrolls to the tapped pin even after an upstream insert reordered the list', () => {
      const controller = createMapCarouselController()
      controller.setContacts([marker('a'), marker('b'), marker('c')])
      controller.setContacts([
        marker('x'),
        marker('a'),
        marker('b'),
        marker('c'),
      ])
      const result = controller.select('b')
      expect(result.activeId).toBe('b')
      expect(result.index).toBe(2)
      expect(result.requiresScroll).toBe(true)
    })
  })
})
