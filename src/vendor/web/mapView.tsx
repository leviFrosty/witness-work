import {
  createContext,
  createElement,
  forwardRef,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native'
import type {
  LatLng,
  MapMarkerProps,
  MapViewProps,
  MapPolylineProps,
  Region,
} from 'react-native-maps'
import links from '@/constants/links'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n, { _i18n } from '@/lib/locales'
import { logger } from '@/lib/logger'
import type {
  EdgePadding,
  FramePin,
  FramePolyline,
  MapFrameOptions,
} from '@/lib/mapsFrame/protocol'
import { coordinateFor, pointFor } from '@/lib/mapsFrame/projection'
import { accountSessions } from '@/lib/serverAccount'
import apis from '@/constants/apis'
import { toHexColor } from '@/vendor/web/maps/color'
import {
  createFrameClient,
  type FrameClient,
  type FrameEvent,
  type FrameStatus,
} from '@/vendor/web/maps/frameClient'
import MapUnavailable from '@/vendor/web/maps/MapUnavailable'
import { createMapKitTokens } from '@/vendor/web/maps/mapkitTokens'
import {
  createOverlayLayout,
  markerPlacement,
  type OverlayLayout,
} from '@/vendor/web/maps/overlayLayout'

/**
 * React-native-maps in the web build (see `metro/bundleRedirects.js`,
 * docs/web-maps.md): Apple MapKit JS in a sandboxed frame on its own origin,
 * which gets coordinates, opaque pin ids, colors and the camera, never what a
 * pin is. Custom marker views (Contacts' pins, their cards) stay in the app and
 * ride over the frame, placed from the frame's visible rect. Plain pins and
 * lines are drawn by the frame, so they move with the map exactly.
 */

const tokens = createMapKitTokens({
  request: (options) => accountSessions.request(options),
  url: apis.mapkitTokens,
  origin: links.mapsFrame,
})

const NO_PADDING: EdgePadding = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * Room around fitted coordinates for a pin drawn over each, and on either side
 * for a column of map buttons.
 */
const FIT_MARGIN: EdgePadding = { top: 40, right: 64, bottom: 40, left: 64 }

const LAYERS = new Set(['standard', 'satellite', 'hybrid'])

type FrameFeature =
  | {
      kind: 'pin'
      pin: Omit<FramePin, 'id'>
      onPress?: () => void
      onDragEnd?: (coordinate: LatLng) => void
    }
  | { kind: 'polyline'; polyline: Omit<FramePolyline, 'id'> }

type MapContextValue = {
  layout: OverlayLayout
  /** Sets or, with null, removes what the frame draws for `key`. */
  setFeature: (key: string, feature: FrameFeature | null) => void
}

const MapContext = createContext<MapContextValue | null>(null)

const sumPadding = (a: EdgePadding, b?: Partial<EdgePadding>): EdgePadding => ({
  top: a.top + (b?.top ?? 0),
  right: a.right + (b?.right ?? 0),
  bottom: a.bottom + (b?.bottom ?? 0),
  left: a.left + (b?.left ?? 0),
})

/** `pt-br` as MapKit writes it: `pt-BR`. */
const mapLanguage = (locale: string) =>
  locale.replace(
    /-([a-z]{2})$/,
    (_, region: string) => `-${region.toUpperCase()}`
  )

const zoomFor = (region: Region) =>
  Math.log2(360 / Math.max(region.longitudeDelta, 1e-9))

type WebMapViewProps = MapViewProps & {
  children?: ReactNode
  showsPointsOfInterest?: boolean
  /** React-native-maps' iOS spelling, which RouteMap uses. */
  showsPointsOfInterests?: boolean
}

const MapView = forwardRef<unknown, WebMapViewProps>(
  function MapView(props, ref) {
    const theme = useTheme()
    const systemScheme = useColorScheme()
    const [attempt, setAttempt] = useState(0)
    const [status, setStatus] = useState<FrameStatus>({ state: 'loading' })
    const frameRef = useRef<HTMLIFrameElement | null>(null)
    const clientRef = useRef<FrameClient | null>(null)
    const [layout] = useState(createOverlayLayout)
    const region = useRef<Region | null>(null)
    const features = useRef(new Map<string, FrameFeature>())
    const pinKeys = useRef(new Map<string, string>())
    const nextPin = useRef(1)
    const flushQueued = useRef(false)
    // The latest props, for the frame's events.
    const latest = useRef(props)
    useEffect(() => {
      latest.current = props
    })

    const padding: EdgePadding = { ...NO_PADDING, ...props.mapPadding }
    const options: MapFrameOptions = {
      colorScheme:
        (props.userInterfaceStyle ?? systemScheme) === 'dark'
          ? 'dark'
          : 'light',
      layer: LAYERS.has(props.mapType ?? '')
        ? (props.mapType as MapFrameOptions['layer'])
        : 'standard',
      padding,
      // One switch for both: a map that can't pan doesn't zoom either.
      interactive: props.scrollEnabled !== false && props.zoomEnabled !== false,
      showsPointsOfInterest:
        props.showsPointsOfInterest ?? props.showsPointsOfInterests ?? true,
    }
    const optionsKey = JSON.stringify(options)

    // Pins and lines go to the frame together, once per change.
    const flush = () => {
      flushQueued.current = false
      const client = clientRef.current
      if (!client) return
      const pins: FramePin[] = []
      const polylines: FramePolyline[] = []
      for (const [key, feature] of features.current) {
        if (feature.kind === 'pin')
          pins.push({ id: pinKeys.current.get(key)!, ...feature.pin })
        else polylines.push({ id: key, ...feature.polyline })
      }
      client.setPins(pins)
      client.setPolylines(polylines)
    }
    const [context] = useState<MapContextValue>(() => ({
      layout,
      setFeature: (key, feature) => {
        if (feature) {
          features.current.set(key, feature)
          // Opaque to the frame: never the marker's identifier.
          if (feature.kind === 'pin' && !pinKeys.current.has(key))
            pinKeys.current.set(key, `p${nextPin.current++}`)
        } else {
          features.current.delete(key)
          pinKeys.current.delete(key)
        }
        if (flushQueued.current) return
        flushQueued.current = true
        queueMicrotask(flush)
      },
    }))

    const featureForPin = (id: string) => {
      for (const [key, pinId] of pinKeys.current)
        if (pinId === id) {
          const feature = features.current.get(key)
          return feature?.kind === 'pin' ? feature : null
        }
      return null
    }

    const onEvent = (event: FrameEvent) => {
      const current = latest.current
      switch (event.type) {
        case 'region': {
          layout.update(event.rect, event.size)
          region.current = event.region
          if (event.phase === 'start') {
            if (event.byUser) current.onPanDrag?.(undefined as never)
            current.onRegionChangeStart?.(event.region, {
              isGesture: event.byUser,
            })
          } else {
            // Every step, and where it settles, which is also the first region.
            current.onRegionChange?.(event.region, { isGesture: event.byUser })
            if (event.phase === 'end')
              current.onRegionChangeComplete?.(event.region, {
                isGesture: event.byUser,
              })
          }
          return
        }
        case 'press': {
          const handler =
            event.kind === 'press' ? current.onPress : current.onLongPress
          const point = layout.current()
          handler?.({
            nativeEvent: {
              coordinate: event.coordinate,
              position: point
                ? pointFor(event.coordinate, point.rect, point.size)
                : { x: 0, y: 0 },
            },
          } as never)
          return
        }
        case 'pinPress':
          featureForPin(event.id)?.onPress?.()
          return
        case 'pinDragEnd':
          featureForPin(event.id)?.onDragEnd?.(event.coordinate)
          return
      }
    }

    // One frame client per attempt: Try Again starts over. Option changes go
    // through `setOptions`, and events read the latest props.
    const connect = useEffectEvent(() => {
      setStatus({ state: 'loading' })
      const client = createFrameClient({
        origin: links.mapsFrame,
        target: () => frameRef.current?.contentWindow ?? null,
        token: tokens.get,
        resetToken: tokens.reset,
        onEvent: (event) => onEvent(event),
        onStatus: (next) => {
          setStatus(next)
          if (next.state === 'ready') {
            latest.current.onMapReady?.()
            latest.current.onMapLoaded?.(undefined as never)
          }
          // Once a session per reason (`analyticsFrequency.ts`).
          if (next.state === 'unavailable')
            analytics.capture('map_unavailable', { reason: next.reason })
        },
        onProblem: (code) =>
          logger.warn(`[Map] The maps frame reported ${code}`),
        isOnline: () => navigator.onLine,
      })
      clientRef.current = client
      const receive = (event: MessageEvent) =>
        client.receive({
          origin: event.origin,
          source: event.source,
          data: event.data,
        })
      window.addEventListener('message', receive)
      const initial = (latest.current.region ??
        latest.current.initialRegion) as Region | undefined
      client.start({
        language: mapLanguage(_i18n.locale),
        options,
        ...(initial && { region: initial }),
      })
      flush()
      return () => {
        window.removeEventListener('message', receive)
        client.dispose()
        clientRef.current = null
      }
    })
    useEffect(() => connect(), [attempt])

    // Offline, the map comes back by itself once the browser is online.
    const offline =
      status.state === 'unavailable' && status.reason === 'offline'
    useEffect(() => {
      if (!offline) return
      const retry = () => setAttempt((count) => count + 1)
      window.addEventListener('online', retry)
      return () => window.removeEventListener('online', retry)
    }, [offline])

    useEffect(() => {
      clientRef.current?.setOptions(JSON.parse(optionsKey) as MapFrameOptions)
    }, [optionsKey])

    // A controlled `region` moves the camera when it changes.
    const regionKey = props.region ? JSON.stringify(props.region) : null
    useEffect(() => {
      if (regionKey)
        clientRef.current?.move({
          type: 'camera',
          region: JSON.parse(regionKey) as Region,
          duration: 0,
        })
    }, [regionKey])

    // The User's own location, from the app, only once they've allowed it: the
    // frame never asks the browser itself.
    const showsUser = !!props.showsUserLocation && status.state === 'ready'
    useEffect(() => {
      if (!showsUser || !navigator.geolocation) return
      let watch: number | null = null
      let cancelled = false
      let permission: PermissionStatus | null = null
      const follow = () => {
        if (cancelled || watch !== null) return
        if (permission && permission.state !== 'granted') return
        watch = navigator.geolocation.watchPosition(
          ({ coords }) =>
            clientRef.current?.setUserLocation({
              latitude: coords.latitude,
              longitude: coords.longitude,
            }),
          () => clientRef.current?.setUserLocation(null),
          { enableHighAccuracy: true, maximumAge: 60_000 }
        )
      }
      void (async () => {
        permission =
          (await navigator.permissions
            ?.query({ name: 'geolocation' })
            .catch(() => null)) ?? null
        if (cancelled) return
        // Allowed later, from the map's locate button.
        permission?.addEventListener('change', follow)
        follow()
      })()
      return () => {
        cancelled = true
        permission?.removeEventListener('change', follow)
        if (watch !== null) navigator.geolocation.clearWatch(watch)
        clientRef.current?.setUserLocation(null)
      }
    }, [showsUser])

    useImperativeHandle(ref, () => {
      const camera = () => {
        const current = region.current
        return {
          center: current
            ? { latitude: current.latitude, longitude: current.longitude }
            : { latitude: 0, longitude: 0 },
          heading: 0,
          pitch: 0,
          zoom: current ? zoomFor(current) : 0,
          altitude: 0,
        }
      }
      const move = (
        next: { center?: LatLng; zoom?: number },
        duration: number
      ) => {
        const current = region.current
        const center = next.center ?? current
        if (!center) return
        if (next.zoom !== undefined) {
          const delta = 360 / 2 ** next.zoom
          clientRef.current?.move({
            type: 'camera',
            region: {
              latitude: center.latitude,
              longitude: center.longitude,
              latitudeDelta: delta,
              longitudeDelta: delta,
            },
            duration,
          })
        } else
          clientRef.current?.move({
            type: 'center',
            center: { latitude: center.latitude, longitude: center.longitude },
            duration,
          })
      }
      return {
        animateToRegion: (next: Region, duration = 500) =>
          clientRef.current?.move({ type: 'camera', region: next, duration }),
        animateCamera: (
          next: { center?: LatLng; zoom?: number },
          opts?: { duration?: number }
        ) => move(next, opts?.duration ?? 500),
        setCamera: (next: { center?: LatLng; zoom?: number }) => move(next, 0),
        fitToCoordinates: (
          coordinates: LatLng[] = [],
          opts?: { edgePadding?: Partial<EdgePadding>; animated?: boolean }
        ) =>
          clientRef.current?.move({
            type: 'fit',
            coordinates: coordinates.map(({ latitude, longitude }) => ({
              latitude,
              longitude,
            })),
            // The app's own pins and cards are views over the map, so leave
            // room for them inside the edges, as the native maps do.
            padding: sumPadding(
              sumPadding(padding, opts?.edgePadding),
              FIT_MARGIN
            ),
            animated: opts?.animated ?? true,
          }),
        getCamera: async () => camera(),
        getMapBoundaries: async () => {
          const current = region.current
          if (!current)
            return {
              northEast: { latitude: 0, longitude: 0 },
              southWest: { latitude: 0, longitude: 0 },
            }
          return {
            northEast: {
              latitude: current.latitude + current.latitudeDelta / 2,
              longitude: current.longitude + current.longitudeDelta / 2,
            },
            southWest: {
              latitude: current.latitude - current.latitudeDelta / 2,
              longitude: current.longitude - current.longitudeDelta / 2,
            },
          }
        },
        // The frame's own answer; the overlay's math while it isn't up.
        pointForCoordinate: async (coordinate: LatLng) => {
          const client = clientRef.current
          if (client?.status().state === 'ready')
            return (await client.project([coordinate]))[0]!
          const view = layout.current()
          if (!view) throw new Error('The map has no view yet')
          return pointFor(coordinate, view.rect, view.size)
        },
        coordinateForPoint: async (point: { x: number; y: number }) => {
          const client = clientRef.current
          if (client?.status().state === 'ready')
            return (await client.unproject([point]))[0]!
          const view = layout.current()
          if (!view) throw new Error('The map has no view yet')
          return coordinateFor(point, view.rect, view.size)
        },
      }
    })

    const unavailable = status.state === 'unavailable' ? status.reason : null

    return (
      <View
        testID={props.testID ?? 'map-view'}
        style={[{ overflow: 'hidden' }, props.style]}
        onLayout={(event: LayoutChangeEvent) => props.onLayout?.(event)}
      >
        {unavailable ? (
          <MapUnavailable
            reason={unavailable}
            inset={padding}
            onRetry={() => setAttempt((count) => count + 1)}
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.colors.backgroundLighter },
            ]}
          >
            {createElement('iframe', {
              key: attempt,
              ref: frameRef,
              src: `${links.mapsFrame}/`,
              title: i18n.t('map_frameTitle'),
              // Its own origin, so MapKit's token works there; that origin
              // isn't the app's, so it reaches nothing of the app's.
              sandbox: 'allow-scripts allow-same-origin',
              referrerPolicy: 'no-referrer',
              allow: '',
              onLoad: () => clientRef.current?.frameLoaded(),
              style: {
                border: 0,
                width: '100%',
                height: '100%',
                display: 'block',
                colorScheme: 'normal',
              },
            })}
          </View>
        )}
        {!unavailable && (
          <MapContext.Provider value={context}>
            <View
              pointerEvents='box-none'
              style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
            >
              {props.children}
            </View>
          </MapContext.Provider>
        )}
      </View>
    )
  }
)

/** A custom marker view, placed over the map by the overlay. */
function OverlayMarker({
  coordinate,
  anchor,
  centerOffset,
  zIndex,
  onPress,
  accessibilityLabel,
  children,
}: MapMarkerProps & { children: ReactNode }) {
  const map = useContext(MapContext)
  const node = useRef<HTMLElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null
  )
  const { latitude, longitude } = coordinate
  const placement = markerPlacement({ anchor, centerOffset })
  const placementKey = JSON.stringify(placement)
  // Before paint, so a new view never shows at the map's corner first.
  useLayoutEffect(() => {
    const element = node.current
    if (!map || !element) return
    return map.layout.add({
      node: element,
      coordinate: { latitude, longitude },
      ...(JSON.parse(placementKey) as ReturnType<typeof markerPlacement>),
      size,
    })
  }, [map, latitude, longitude, placementKey, size])

  return (
    <View
      ref={(element) => {
        node.current = element as unknown as HTMLElement | null
      }}
      pointerEvents='box-none'
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout
        setSize((current) =>
          current?.width === width && current.height === height
            ? current
            : { width, height }
        )
      }}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        zIndex: zIndex ?? 0,
      }}
    >
      {onPress ? (
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={accessibilityLabel}
          onPress={(event) => onPress(event as never)}
        >
          {children}
        </Pressable>
      ) : (
        children
      )}
    </View>
  )
}

/** A plain pin, which the frame draws. */
function FrameMarker({
  coordinate,
  pinColor,
  draggable,
  onPress,
  onDragEnd,
}: MapMarkerProps) {
  const map = useContext(MapContext)
  const key = useId()
  const theme = useTheme()
  const color = toHexColor(pinColor, toHexColor(theme.colors.accent))
  const handlers = useRef({ onPress, onDragEnd })
  useEffect(() => {
    handlers.current = { onPress, onDragEnd }
  })
  const { latitude, longitude } = coordinate
  useEffect(() => {
    if (!map) return
    map.setFeature(key, {
      kind: 'pin',
      pin: {
        latitude,
        longitude,
        color,
        ...(draggable && { draggable: true }),
      },
      onPress: () => handlers.current.onPress?.(undefined as never),
      onDragEnd: (next) =>
        handlers.current.onDragEnd?.({
          nativeEvent: { coordinate: next },
        } as never),
    })
  }, [map, key, latitude, longitude, color, draggable])
  useEffect(() => () => map?.setFeature(key, null), [map, key])
  return null
}

const Marker = forwardRef<unknown, MapMarkerProps>(function Marker(props, ref) {
  // Android's bitmap redraws have nothing to redraw here.
  useImperativeHandle(ref, () => ({
    redraw: () => {},
    showCallout: () => {},
    hideCallout: () => {},
  }))
  return props.children ? (
    <OverlayMarker {...props} children={props.children} />
  ) : (
    <FrameMarker {...props} />
  )
})

/** A line, which the frame draws. */
function Polyline({ coordinates, strokeColor, strokeWidth }: MapPolylineProps) {
  const map = useContext(MapContext)
  const key = `l${useId()
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()}`.slice(0, 40)
  const theme = useTheme()
  const color = toHexColor(strokeColor, toHexColor(theme.colors.accent))
  const flat = coordinates.flatMap((c) => [c.latitude, c.longitude])
  const flatKey = flat.join(',')
  useEffect(() => {
    if (!map) return
    map.setFeature(key, {
      kind: 'polyline',
      polyline: {
        coordinates: flatKey ? flatKey.split(',').map(Number) : [],
        color,
        width: strokeWidth ?? 3,
      },
    })
  }, [map, key, flatKey, color, strokeWidth])
  useEffect(() => () => map?.setFeature(key, null), [map, key])
  return null
}

export default MapView
export { MapView, Marker, Polyline }
