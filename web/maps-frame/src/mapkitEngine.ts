import type {
  EdgePadding,
  FrameMessage,
  FramePolyline,
  LatLng,
  MapFrameOptions,
  Point,
  Region,
} from '../../../src/lib/mapsFrame/protocol'
import type { EngineStart, MapEngine } from './controller'

export const MAPKIT_URL =
  'https://cdn.apple-mapkit.com/mk/6.1.197/mapkit.core.js'
export const MAPKIT_INTEGRITY =
  'sha384-L6TneGwMwbv03TVXXAttWgmdZu2kqpqeblUebJUQFtPMmiQAwVkftBQwy8MlGgGY'

type MapKit = any
type MapKitMap = any

declare global {
  interface Window {
    mapkit?: MapKit
  }
}

const USER_COLOR = '#0a84ff'

function loadScript(): Promise<MapKit> {
  if (window.mapkit) return Promise.resolve(window.mapkit)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = MAPKIT_URL
    script.integrity = MAPKIT_INTEGRITY
    script.crossOrigin = 'anonymous'
    script.async = true
    script.addEventListener('load', () =>
      window.mapkit ? resolve(window.mapkit) : reject(new Error('no mapkit'))
    )
    script.addEventListener('error', () => reject(new Error('mapkit failed')))
    document.head.append(script)
  })
}

const padding = (mapkit: MapKit, edges: EdgePadding) =>
  new mapkit.Padding(edges.top, edges.right, edges.bottom, edges.left)

const coordinateRegion = (mapkit: MapKit, region: Region) =>
  new mapkit.CoordinateRegion(
    new mapkit.Coordinate(region.latitude, region.longitude),
    new mapkit.CoordinateSpan(region.latitudeDelta, region.longitudeDelta)
  )

const mapType = (mapkit: MapKit, layer: MapFrameOptions['layer']) =>
  layer === 'satellite'
    ? mapkit.Map.MapTypes.Satellite
    : layer === 'hybrid'
      ? mapkit.Map.MapTypes.Hybrid
      : mapkit.Map.MapTypes.Standard

export function createMapKitEngine(element: HTMLElement): MapEngine {
  let mapkit: MapKit
  let map: MapKitMap | null = null
  let emit: (message: FrameMessage) => void = () => {}
  let pins = new Map<string, any>()
  let lines: any[] = []
  let user: any = null

  let pointerDown = false
  let byUser = false
  let moving = false

  const box = () => element.getBoundingClientRect()

  const regionMessage = (phase: 'start' | 'change' | 'end'): FrameMessage => {
    const { center, span } = map.region
    const rect = map.visibleMapRect
    const { width, height } = box()
    return {
      type: 'region',
      phase,
      region: {
        latitude: center.latitude,
        longitude: center.longitude,
        latitudeDelta: span.latitudeDelta,
        longitudeDelta: span.longitudeDelta,
      },
      rect: {
        x: rect.origin.x,
        y: rect.origin.y,
        width: rect.size.width,
        height: rect.size.height,
      },
      size: { width, height },
      byUser,
    }
  }

  const follow = () => {
    if (!moving || !map) return
    emit(regionMessage('change'))
    requestAnimationFrame(follow)
  }

  const toCoordinate = (event: { pointOnPage: unknown }): LatLng => {
    const coordinate = map.convertPointOnPageToCoordinate(event.pointOnPage)
    return { latitude: coordinate.latitude, longitude: coordinate.longitude }
  }

  return {
    async start(start: EngineStart, send) {
      emit = send
      mapkit = await loadScript()
      mapkit.addEventListener('error', (event: { status?: string }) => {
        emit({
          type: 'error',
          code:
            event.status === 'Unauthorized'
              ? 'unauthorized'
              : event.status === 'Too Many Requests'
                ? 'rate_limited'
                : 'load_failed',
        })
      })
      mapkit.init({
        language: start.language,
        authorizationCallback: (done: (token: string) => void) => {
          void start.token().then((token) => done(token ?? ''))
        },
      })
      await mapkit.load(['full-map'])
      const { options } = start
      map = new mapkit.Map(element, {
        mapType: mapType(mapkit, options.layer),
        colorScheme:
          options.colorScheme === 'dark'
            ? mapkit.Map.ColorSchemes.Dark
            : mapkit.Map.ColorSchemes.Light,
        padding: padding(mapkit, options.padding),

        isRotationEnabled: false,
        showsCompass: mapkit.FeatureVisibility.Hidden,
        showsMapTypeControl: false,
        showsZoomControl: options.interactive,
        showsUserLocationControl: false,
        showsPointsOfInterest: options.showsPointsOfInterest,
        isScrollEnabled: options.interactive,
        isZoomEnabled: options.interactive,
        ...(start.region && {
          region: coordinateRegion(mapkit, start.region),
        }),
      })
      element.addEventListener('pointerdown', () => (pointerDown = true))
      window.addEventListener('pointerup', () => (pointerDown = false))
      element.addEventListener('wheel', () => (byUser = true), {
        passive: true,
      })
      map.addEventListener('region-change-start', () => {
        byUser = byUser || pointerDown
        moving = true
        emit(regionMessage('start'))
        requestAnimationFrame(follow)
      })
      map.addEventListener('region-change-end', () => {
        moving = false
        emit(regionMessage('end'))
        byUser = false
      })
      map.addEventListener('single-tap', (event: { pointOnPage: unknown }) =>
        emit({ type: 'press', kind: 'press', coordinate: toCoordinate(event) })
      )
      map.addEventListener('long-press', (event: { pointOnPage: unknown }) =>
        emit({
          type: 'press',
          kind: 'longPress',
          coordinate: toCoordinate(event),
        })
      )
      map.addEventListener('select', (event: { annotation?: any }) => {
        const id = event.annotation?.data?.id
        if (typeof id === 'string') {
          emit({ type: 'pinPress', id })

          map.selectedAnnotation = null
        }
      })
      map.addEventListener('drag-end', (event: { annotation?: any }) => {
        const id = event.annotation?.data?.id
        const coordinate = event.annotation?.coordinate
        if (typeof id === 'string' && coordinate)
          emit({
            type: 'pinDragEnd',
            id,
            coordinate: {
              latitude: coordinate.latitude,
              longitude: coordinate.longitude,
            },
          })
      })
      new ResizeObserver(() => {
        if (map && !moving) emit(regionMessage('end'))
      }).observe(element)
      emit({ type: 'ready' })
      emit(regionMessage('end'))
    },
    setOptions(options) {
      if (!map) return
      map.mapType = mapType(mapkit, options.layer)
      map.colorScheme =
        options.colorScheme === 'dark'
          ? mapkit.Map.ColorSchemes.Dark
          : mapkit.Map.ColorSchemes.Light
      map.padding = padding(mapkit, options.padding)
      map.showsPointsOfInterest = options.showsPointsOfInterest
      map.isScrollEnabled = options.interactive
      map.isZoomEnabled = options.interactive
    },
    setCamera(region, duration) {
      map?.setRegionAnimated(coordinateRegion(mapkit, region), duration > 0)
    },
    setCenter(center, duration) {
      map?.setCenterAnimated(
        new mapkit.Coordinate(center.latitude, center.longitude),
        duration > 0
      )
    },
    fit(coordinates, edges, animated) {
      if (!map || coordinates.length === 0) return
      const latitudes = coordinates.map((c) => c.latitude)
      const longitudes = coordinates.map((c) => c.longitude)
      const north = Math.max(...latitudes)
      const south = Math.min(...latitudes)
      const east = Math.max(...longitudes)
      const west = Math.min(...longitudes)
      const previous = map.padding
      map.padding = padding(mapkit, edges)
      map.setRegionAnimated(
        new mapkit.BoundingRegion(
          north,
          east,
          south,
          west
        ).toCoordinateRegion(),
        animated
      )
      map.padding = previous
    },
    setPins(next) {
      if (!map) return
      const keep = new Map<string, any>()
      for (const pin of next) {
        const existing = pins.get(pin.id)
        const coordinate = new mapkit.Coordinate(pin.latitude, pin.longitude)
        if (existing && existing.color === pin.color) {
          existing.coordinate = coordinate
          existing.draggable = !!pin.draggable
          keep.set(pin.id, existing)
          pins.delete(pin.id)
          continue
        }
        const annotation = new mapkit.MarkerAnnotation(coordinate, {
          color: pin.color,
          draggable: !!pin.draggable,

          data: { id: pin.id },
        })
        map.addAnnotation(annotation)
        keep.set(pin.id, annotation)
      }
      if (pins.size) map.removeAnnotations([...pins.values()])
      pins = keep
    },
    setPolylines(next: FramePolyline[]) {
      if (!map) return
      if (lines.length) map.removeOverlays(lines)
      lines = next.map((line) => {
        const coordinates = []
        for (let i = 0; i < line.coordinates.length; i += 2)
          coordinates.push(
            new mapkit.Coordinate(line.coordinates[i], line.coordinates[i + 1])
          )
        return new mapkit.PolylineOverlay(coordinates, {
          style: new mapkit.Style({
            strokeColor: line.color,
            lineWidth: line.width,
            lineCap: 'round',
            lineJoin: 'round',
          }),
        })
      })
      if (lines.length) map.addOverlays(lines)
    },
    setUserLocation(location) {
      if (!map) return
      if (user) {
        map.removeAnnotation(user)
        user = null
      }
      if (!location) return

      user = new mapkit.MarkerAnnotation(
        new mapkit.Coordinate(location.latitude, location.longitude),
        { color: USER_COLOR, enabled: false, glyphText: '' }
      )
      map.addAnnotation(user)
    },
    project(coordinates): Point[] {
      if (!map) return coordinates.map(() => ({ x: 0, y: 0 }))
      const { left, top } = box()
      return coordinates.map((c) => {
        const point = map.convertCoordinateToPointOnPage(
          new mapkit.Coordinate(c.latitude, c.longitude)
        )
        return {
          x: point.x - left - window.scrollX,
          y: point.y - top - window.scrollY,
        }
      })
    },
    unproject(points): LatLng[] {
      if (!map) return points.map(() => ({ latitude: 0, longitude: 0 }))
      const { left, top } = box()
      return points.map((p) => {
        const coordinate = map.convertPointOnPageToCoordinate(
          new DOMPoint(p.x + left + window.scrollX, p.y + top + window.scrollY)
        )
        return {
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
        }
      })
    },
  }
}
