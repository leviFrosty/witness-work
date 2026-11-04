// The maps frame's test double (e2e/web/maps.spec.ts): the real frame
// controller (`web/maps-frame/src/controller.ts`) with a plain map in place of
// MapKit JS. It draws a grid, pins as dots and lines as SVG, pans by dragging,
// zooms with the wheel, and projects with the same Web Mercator math the app
// uses. Built by the spec and served only in tests; never deployed.
import type {
  FrameMessage,
  FramePin,
  FramePolyline,
  LatLng,
  Region,
  WorldRect,
} from '../../src/lib/mapsFrame/protocol'
import {
  coordinateFor,
  pointFor,
  rectFitting,
  rectFor,
  regionFor,
  toWorld,
} from '../../src/lib/mapsFrame/projection'
import type { MapEngine } from '../../web/maps-frame/src/controller'
import { startFrame } from '../../web/maps-frame/src/frame'

declare global {
  interface Window {
    /** Every message this frame received, as it arrived. */
    __wwMapsReceived: unknown[]
  }
}

const LONG_PRESS_MS = 600
const DRAG_SLOP = 4

const WORLD: Region = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 120,
  longitudeDelta: 300,
}

function createDoubleEngine(element: HTMLElement): MapEngine {
  let emit: (message: FrameMessage) => void = () => {}
  let rect: WorldRect = { x: 0, y: 0, width: 1, height: 1 }
  let pins: FramePin[] = []
  let polylines: FramePolyline[] = []
  let user: LatLng | null = null
  let dark = false
  let interactive = true
  // As MapKit does, the camera centers and fits inside the padding.
  let padding = { top: 0, right: 0, bottom: 0, left: 0 }
  const svgNs = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNs, 'svg')
  svg.setAttribute('class', 'lines')
  const layer = document.createElement('div')
  layer.className = 'pins'
  element.append(svg, layer)

  const size = () => ({
    width: element.clientWidth,
    height: element.clientHeight,
  })

  const send = (phase: 'start' | 'change' | 'end', byUser: boolean) =>
    emit({
      type: 'region',
      phase,
      region: regionFor(rect),
      rect,
      size: size(),
      byUser,
    })

  const draw = () => {
    const extent = size()
    element.dataset.scheme = dark ? 'dark' : 'light'
    // The grid moves with the map, so a pan shows.
    const cell = 64
    const origin = pointFor({ latitude: 0, longitude: 0 }, rect, extent)
    element.style.backgroundPosition = `${origin.x % cell}px ${origin.y % cell}px`
    layer.replaceChildren(
      ...pins.map((pin) => {
        const dot = document.createElement('button')
        const { x, y } = pointFor(pin, rect, extent)
        dot.className = 'pin'
        dot.dataset.pinId = pin.id
        dot.style.left = `${x}px`
        dot.style.top = `${y}px`
        dot.style.background = pin.color
        dot.addEventListener('pointerdown', (event) => {
          event.stopPropagation()
          const start = { x: event.clientX, y: event.clientY }
          let moved = false
          const move = (next: PointerEvent) => {
            if (!pin.draggable) return
            moved ||=
              Math.hypot(next.clientX - start.x, next.clientY - start.y) >
              DRAG_SLOP
            const box = element.getBoundingClientRect()
            dot.style.left = `${next.clientX - box.left}px`
            dot.style.top = `${next.clientY - box.top}px`
          }
          const up = (next: PointerEvent) => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            if (!moved) return emit({ type: 'pinPress', id: pin.id })
            const box = element.getBoundingClientRect()
            emit({
              type: 'pinDragEnd',
              id: pin.id,
              coordinate: coordinateFor(
                { x: next.clientX - box.left, y: next.clientY - box.top },
                rect,
                extent
              ),
            })
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        })
        return dot
      }),
      ...(user
        ? [
            Object.assign(document.createElement('div'), {
              className: 'user',
              style: `left:${pointFor(user, rect, extent).x}px;top:${pointFor(user, rect, extent).y}px`,
            }),
          ]
        : [])
    )
    svg.replaceChildren(
      ...polylines.map((line) => {
        const path = document.createElementNS(svgNs, 'polyline')
        const points: string[] = []
        for (let i = 0; i < line.coordinates.length; i += 2) {
          const { x, y } = pointFor(
            {
              latitude: line.coordinates[i]!,
              longitude: line.coordinates[i + 1]!,
            },
            rect,
            extent
          )
          points.push(`${x},${y}`)
        }
        path.setAttribute('points', points.join(' '))
        path.setAttribute('stroke', line.color)
        path.setAttribute('stroke-width', String(line.width))
        path.setAttribute('fill', 'none')
        path.dataset.lineId = line.id
        return path
      })
    )
  }

  const moveTo = (next: WorldRect, byUser = false) => {
    send('start', byUser)
    rect = next
    draw()
    send('change', byUser)
    send('end', byUser)
  }

  // Drag to pan; click to press; hold to long-press.
  element.addEventListener('pointerdown', (event) => {
    if (!interactive) return
    const start = { x: event.clientX, y: event.clientY }
    const from = rect
    let dragging = false
    let held = false
    const timer = setTimeout(() => {
      if (dragging) return
      held = true
      const box = element.getBoundingClientRect()
      emit({
        type: 'press',
        kind: 'longPress',
        coordinate: coordinateFor(
          { x: start.x - box.left, y: start.y - box.top },
          rect,
          size()
        ),
      })
    }, LONG_PRESS_MS)
    const move = (next: PointerEvent) => {
      const dx = next.clientX - start.x
      const dy = next.clientY - start.y
      if (!dragging && Math.hypot(dx, dy) <= DRAG_SLOP) return
      if (!dragging) {
        dragging = true
        clearTimeout(timer)
        send('start', true)
      }
      const extent = size()
      rect = {
        ...from,
        x: from.x - (dx / extent.width) * from.width,
        y: from.y - (dy / extent.height) * from.height,
      }
      draw()
      send('change', true)
    }
    const up = (next: PointerEvent) => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (dragging) return send('end', true)
      if (held) return
      const box = element.getBoundingClientRect()
      emit({
        type: 'press',
        kind: 'press',
        coordinate: coordinateFor(
          { x: next.clientX - box.left, y: next.clientY - box.top },
          rect,
          size()
        ),
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })

  let wheelEnd: ReturnType<typeof setTimeout> | undefined
  element.addEventListener(
    'wheel',
    (event) => {
      if (!interactive) return
      event.preventDefault()
      if (!wheelEnd) send('start', true)
      clearTimeout(wheelEnd)
      const box = element.getBoundingClientRect()
      const extent = size()
      const at = { x: event.clientX - box.left, y: event.clientY - box.top }
      const scale = Math.exp(event.deltaY / 300)
      const anchor = {
        x: rect.x + (at.x / extent.width) * rect.width,
        y: rect.y + (at.y / extent.height) * rect.height,
      }
      const width = rect.width * scale
      const height = rect.height * scale
      rect = {
        x: anchor.x - (at.x / extent.width) * width,
        y: anchor.y - (at.y / extent.height) * height,
        width,
        height,
      }
      draw()
      send('change', true)
      wheelEnd = setTimeout(() => {
        wheelEnd = undefined
        send('end', true)
      }, 150)
    },
    { passive: false }
  )

  new ResizeObserver(() => {
    draw()
    send('end', false)
  }).observe(element)

  return {
    async start(start, next) {
      emit = next
      dark = start.options.colorScheme === 'dark'
      interactive = start.options.interactive
      padding = start.options.padding
      if (!(await start.token())) throw new Error('no token')
      rect = rectFor(start.region ?? WORLD, size())
      if (start.region) {
        // Inside the padding, as a camera move is.
        rect = rectFitting(
          [
            {
              latitude: start.region.latitude + start.region.latitudeDelta / 2,
              longitude:
                start.region.longitude - start.region.longitudeDelta / 2,
            },
            {
              latitude: start.region.latitude - start.region.latitudeDelta / 2,
              longitude:
                start.region.longitude + start.region.longitudeDelta / 2,
            },
          ],
          size(),
          padding,
          1e-9
        )!
      }
      draw()
      emit({ type: 'ready' })
      send('end', false)
    },
    setOptions(options) {
      dark = options.colorScheme === 'dark'
      interactive = options.interactive
      padding = options.padding
      element.dataset.layer = options.layer
      draw()
    },
    setCamera(region) {
      const corners = [
        {
          latitude: region.latitude + region.latitudeDelta / 2,
          longitude: region.longitude - region.longitudeDelta / 2,
        },
        {
          latitude: region.latitude - region.latitudeDelta / 2,
          longitude: region.longitude + region.longitudeDelta / 2,
        },
      ]
      const next = rectFitting(corners, size(), padding, 1e-9)
      if (next) moveTo(next)
    },
    setCenter(center) {
      const world = toWorld(center)
      const extent = size()
      const inner = {
        x: padding.left + (extent.width - padding.left - padding.right) / 2,
        y: padding.top + (extent.height - padding.top - padding.bottom) / 2,
      }
      moveTo({
        ...rect,
        x: world.x - (inner.x / extent.width) * rect.width,
        y: world.y - (inner.y / extent.height) * rect.height,
      })
    },
    fit(coordinates, edges) {
      const next = rectFitting(coordinates, size(), edges)
      if (next) moveTo(next)
    },
    setPins(next) {
      pins = next
      draw()
    },
    setPolylines(next) {
      polylines = next
      draw()
    },
    setUserLocation(location) {
      user = location
      draw()
    },
    project: (coordinates) =>
      coordinates.map((coordinate) => pointFor(coordinate, rect, size())),
    unproject: (points) =>
      points.map((point) => coordinateFor(point, rect, size())),
  }
}

window.__wwMapsReceived = []
window.addEventListener('message', (event) =>
  window.__wwMapsReceived.push(event.data)
)
startFrame(createDoubleEngine, ['http://127.0.0.1:*', 'http://localhost:*'])
