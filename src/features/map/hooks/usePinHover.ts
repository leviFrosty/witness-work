import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { Platform } from 'react-native'
import {
  Gesture,
  type GestureStateChangeEvent,
  type GestureUpdateEvent,
  PointerType,
} from 'react-native-gesture-handler'
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

const pinHoverSupported = supportsPointerHover && Platform.OS === 'ios'

const samePin = (a: PinBox | undefined, b: PinBox | undefined) =>
  a?.id === b?.id && a?.box === b?.box

function useHoverGesture(on: {
  begin: (event: GestureStateChangeEvent<Point>) => void
  update: (event: GestureUpdateEvent<Point>) => void
  finalize: () => void
}) {
  return useMemo(
    () =>
      pinHoverSupported
        ? Gesture.Hover()
            .runOnJS(true)
            .onBegin(on.begin)
            .onUpdate(on.update)
            .onFinalize(on.finalize)
        : undefined,
    [on]
  )
}

export default function usePinHover({
  mapRef,
  contacts,
  bounds,
}: {
  mapRef: RefObject<MapView | null>

  contacts: readonly { id: string }[]

  bounds: Bounds
}) {
  const [pin, setPin] = useState<PinBox>()
  const pins = useRef<PinBox[] | null>(null)
  const loading = useRef(false)

  const generation = useRef(0)
  const cameraMoving = useRef(false)
  const dragging = useRef(false)
  const pointer = useRef<Point | null>(null)
  const linkedId = useRef<string | undefined>(undefined)

  const show = (next: PinBox | undefined) =>
    setPin((current) => (samePin(current, next) ? current : next))

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

  useEffect(() => {
    generation.current++
    pins.current = null
    loading.current = false
    setPin(undefined)
  }, [contacts])

  const hover = useHoverGesture({
    begin: (event) => {
      cameraMoving.current = false
      notePointerHover(
        event.pointerType === PointerType.STYLUS ? 'stylus' : 'pointer'
      )
    },
    update: (event) => {
      pointer.current = { x: event.x, y: event.y }
      if (pins.current) refresh()
      else loadPins()
    },
    finalize: () => {
      pointer.current = null
      refresh()
    },
  })

  return {
    hover,

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

    dismiss: () => {
      pointer.current = null
      show(undefined)
    },
    setDragging: (next: boolean) => {
      dragging.current = next

      if (!next) invalidate()
      else show(undefined)
    },

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
