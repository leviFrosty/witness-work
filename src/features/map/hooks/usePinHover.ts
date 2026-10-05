import { type RefObject, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { Gesture, PointerType } from 'react-native-gesture-handler'
import type MapView from 'react-native-maps'
import { notePointerHover, supportsPointerHover } from '@/lib/pointerHover'
import { logger } from '@/lib/logger'
import {
  type Bounds,
  hitTestPins,
  isPinInBounds,
  type MarkerFrames,
  type PinBox,
  type Point,
  toPinBoxes,
} from '@/features/map/lib/pinHover'

/**
 * Apple Maps exposes each pin's exact annotation frame; Google Maps (Android)
 * has no equivalent, and its mouse hover is untested, so pins stay iPad-only.
 */
const pinHoverSupported = supportsPointerHover && Platform.OS === 'ios'

/**
 * Names the contact pin under a hovering pointer (or the one whose inspector
 * row is hovered). Pins are native annotations, so the map container takes the
 * hover and hit-tests against pin frames fetched once per camera position: a
 * pointer move costs a loop over the visible pins, never a native call.
 */
export default function usePinHover({
  mapRef,
  contacts,
  bounds,
}: {
  mapRef: RefObject<MapView | null>
  /** Contacts whose pins are on the map (the dropped pin isn't one). */
  contacts: readonly { id: string }[]
  /** Visible map area; linked pins under overlays stay unlabelled. */
  bounds: Bounds
}) {
  const [pin, setPin] = useState<PinBox>()
  const pins = useRef<PinBox[] | null>(null)
  const loading = useRef(false)
  // Bumped whenever cached frames go stale, so in-flight fetches are dropped.
  const generation = useRef(0)
  const cameraMoving = useRef(false)
  const dragging = useRef(false)
  const pointer = useRef<Point | null>(null)
  const linkedId = useRef<string | undefined>(undefined)

  const show = (next: PinBox | undefined) =>
    setPin((current) =>
      current?.id === next?.id && current?.box === next?.box ? current : next
    )

  const refresh = () => {
    if (!pins.current || dragging.current) return show(undefined)
    if (pointer.current) return show(hitTestPins(pins.current, pointer.current))
    const linked = pins.current.find((p) => p.id === linkedId.current)
    show(linked && isPinInBounds(linked, bounds) ? linked : undefined)
  }

  const loadPins = () => {
    if (pins.current || loading.current || cameraMoving.current) return
    const map = mapRef.current
    if (!map) return
    const requested = generation.current
    const ids = new Set(contacts.map((contact) => contact.id))
    loading.current = true
    map
      .getMarkersFrames(true)
      .then((frames) => {
        if (requested !== generation.current) return
        loading.current = false
        pins.current = toPinBoxes(frames as MarkerFrames, ids)
        refresh()
      })
      .catch((error: unknown) => {
        if (requested !== generation.current) return
        loading.current = false
        logger.warn('[Map] Could not read pin frames', error)
      })
  }

  const invalidate = () => {
    generation.current++
    pins.current = null
    loading.current = false
    show(undefined)
  }

  const wanted = () => !!pointer.current || !!linkedId.current

  // Search, pin colour remounts and drags change which pins exist where; the
  // next pointer move reloads them.
  useEffect(() => {
    generation.current++
    pins.current = null
    loading.current = false
    setPin(undefined)
  }, [contacts])

  const hover = pinHoverSupported
    ? Gesture.Hover()
        .runOnJS(true)
        .onBegin((event) => {
          // Insurance against a camera start whose completion never arrived.
          cameraMoving.current = false
          notePointerHover(
            event.pointerType === PointerType.STYLUS ? 'stylus' : 'pointer'
          )
        })
        .onUpdate((event) => {
          pointer.current = { x: event.x, y: event.y }
          if (pins.current) refresh()
          else loadPins()
        })
        .onFinalize(() => {
          pointer.current = null
          refresh()
        })
    : undefined

  return {
    /** Attach to a view sharing the map's frame; undefined where unsupported. */
    hover,
    /** The pin to label, in map points. */
    pin,
    onRegionChangeStart: pinHoverSupported
      ? () => {
          cameraMoving.current = true
          invalidate()
        }
      : undefined,
    onRegionChangeComplete: pinHoverSupported
      ? () => {
          cameraMoving.current = false
          invalidate()
          if (wanted()) loadPins()
        }
      : undefined,
    /** A click means the label did its job; get out of the way. */
    dismiss: () => {
      pointer.current = null
      show(undefined)
    },
    setDragging: (next: boolean) => {
      dragging.current = next
      // A dropped pin has moved; reload its frame on the next pointer move.
      if (!next) invalidate()
      else show(undefined)
    },
    /** Links an inspector row's hover to its pin without selecting it. */
    linkContact: (id: string, hovered: boolean) => {
      if (!pinHoverSupported) return
      if (hovered) linkedId.current = id
      else if (linkedId.current === id) linkedId.current = undefined
      else return
      if (pins.current) refresh()
      else loadPins()
    },
  }
}
