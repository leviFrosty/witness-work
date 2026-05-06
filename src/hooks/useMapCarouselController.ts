import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ICarouselInstance } from 'react-native-reanimated-carousel'
import {
  CarouselIntent,
  createMapCarouselController,
} from '../lib/mapCarouselController'
import { ContactMarker } from '../types/map'

export interface UseMapCarouselController {
  activeContactId: string | undefined
  activeIndex: number
  carouselRef: React.RefObject<ICarouselInstance | null>
  select(id: string): void
  delete(id: string): void
}

/**
 * React adapter around the framework-free MapCarouselController. Owns the
 * carousel ref so the screen never has to imperatively scroll itself.
 */
export function useMapCarouselController(
  contactMarkers: ContactMarker[]
): UseMapCarouselController {
  const controller = useMemo(() => createMapCarouselController(), [])
  const carouselRef = useRef<ICarouselInstance>(null)
  const [activeContactId, setActiveContactId] = useState<string | undefined>(
    () => contactMarkers[0]?.id
  )
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    contactMarkers.length > 0 ? 0 : -1
  )

  // Mirror the latest contactMarkers in a ref so action callbacks (select /
  // delete) always resolve ids against the freshest list, even if a user
  // input fires after a re-render but before the reconcile useEffect below.
  const contactMarkersRef = useRef(contactMarkers)
  contactMarkersRef.current = contactMarkers

  const applyIntent = useCallback(
    (intent: CarouselIntent, animated: boolean) => {
      setActiveContactId(intent.activeId)
      setActiveIndex(intent.index)
      if (intent.requiresScroll && intent.index >= 0) {
        const current = carouselRef.current?.getCurrentIndex()
        if (current !== intent.index) {
          carouselRef.current?.scrollTo({
            index: intent.index,
            animated,
          })
        }
      }
    },
    []
  )

  // Reconcile against the latest contact list. Handles inserts/removes/reorders
  // upstream so the active id and the carousel index stay in sync.
  useEffect(() => {
    applyIntent(controller.setContacts(contactMarkers), false)
  }, [contactMarkers, controller, applyIntent])

  const select = useCallback(
    (id: string) => {
      // Resolve the id against the freshest contacts before acting — protects
      // against the captured-closure bug where a list reorder between render
      // and tap would scroll to the wrong card.
      controller.setContacts(contactMarkersRef.current)
      applyIntent(controller.select(id), true)
    },
    [controller, applyIntent]
  )

  const remove = useCallback(
    (id: string) => {
      controller.setContacts(contactMarkersRef.current)
      applyIntent(controller.delete(id), true)
    },
    [controller, applyIntent]
  )

  return {
    activeContactId,
    activeIndex,
    carouselRef,
    select,
    delete: remove,
  }
}
