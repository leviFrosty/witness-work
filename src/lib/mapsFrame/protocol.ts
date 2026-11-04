// The messages between the web app and its maps frame (ADR 0037 §8,
// docs/web-maps.md). The frame (`web/maps-frame`) runs Apple MapKit JS on an
// origin of its own; the app tells it where to look and what to draw, and it
// answers with where the User looked and tapped. Only coordinates, opaque pin
// ids, colors, the camera, the layer and the color scheme ever cross: never a
// name, an address, a note or any other text a User wrote.
//
// Both sides import this file, so it imports nothing.

/** Tells these messages apart from anything else a page posts. */
export const MAPS_FRAME_PROTOCOL = 'ww-maps'
/**
 * Bumped only for a change one side can't ignore. The frame deploys apart from
 * the app, so it answers every version a live app may send before the app moves
 * to a new one.
 */
export const MAPS_FRAME_VERSION = 1

/** Most pins one message may carry; the Map shows a few hundred at most. */
export const MAX_PINS = 2000
/** Most lines one message may carry. */
export const MAX_POLYLINES = 8
/** Most points in one line: a long day of road shapes. */
export const MAX_POLYLINE_POINTS = 20_000
/** Most coordinates or points in one projection request. */
export const MAX_PROJECTED = 500
/** Longest MapKit JS token the app passes on. */
export const MAX_TOKEN_LENGTH = 4096

export type LatLng = { latitude: number; longitude: number }

export type Region = LatLng & { latitudeDelta: number; longitudeDelta: number }

export type Point = { x: number; y: number }

export type Size = { width: number; height: number }

/**
 * The visible area in Web Mercator's unit square: `x` grows east from longitude
 * -180°, `y` grows south from about latitude 85°, both 0…1.
 */
export type WorldRect = { x: number; y: number; width: number; height: number }

export type EdgePadding = {
  top: number
  right: number
  bottom: number
  left: number
}

export type MapFrameLayer = 'standard' | 'satellite' | 'hybrid'

export type MapFrameColorScheme = 'light' | 'dark'

/** A plain pin the frame draws itself: a dropped pin, a picker's pins. */
export type FramePin = LatLng & {
  /** Opaque and short (`p1`, `p2`, …), never a Contact's id. */
  id: string
  /** `#rrggbb`. */
  color: string
  draggable?: boolean
}

export type FramePolyline = {
  id: string
  /** Flat `[lat, lng, lat, lng, …]`. */
  coordinates: number[]
  color: string
  width: number
}

export type MapFrameOptions = {
  colorScheme: MapFrameColorScheme
  layer: MapFrameLayer
  padding: EdgePadding
  /** Pans and zooms; off for a preview. */
  interactive: boolean
  showsPointsOfInterest: boolean
}

/** What the app sends the frame. */
export type AppMessage =
  | {
      type: 'init'
      token: string
      /** The app's language, for the map's labels (BCP 47). */
      language: string
      options: MapFrameOptions
      region?: Region
    }
  /** A token the frame asked for (`tokenRequest`), or null when there's none. */
  | { type: 'token'; token: string | null }
  | { type: 'options'; options: MapFrameOptions }
  | { type: 'camera'; region: Region; duration: number }
  | { type: 'center'; center: LatLng; duration: number }
  | {
      type: 'fit'
      coordinates: LatLng[]
      padding: EdgePadding
      animated: boolean
    }
  | { type: 'pins'; pins: FramePin[] }
  | { type: 'polylines'; polylines: FramePolyline[] }
  | { type: 'userLocation'; location: LatLng | null }
  | { type: 'project'; id: number; coordinates: LatLng[] }
  | { type: 'unproject'; id: number; points: Point[] }

/** What the frame sends the app. */
export type FrameMessage =
  /** The map is up and the camera is set. */
  | { type: 'ready' }
  /** MapKit wants a fresh token: answer with `token`. */
  | { type: 'tokenRequest' }
  | {
      type: 'region'
      /** `start` and `end` bracket a move; `change` comes every frame of it. */
      phase: 'start' | 'change' | 'end'
      region: Region
      rect: WorldRect
      size: Size
      /** The User moved it, rather than the app. */
      byUser: boolean
    }
  | { type: 'press'; kind: 'press' | 'longPress'; coordinate: LatLng }
  | { type: 'pinPress'; id: string }
  | { type: 'pinDragEnd'; id: string; coordinate: LatLng }
  | { type: 'projected'; id: number; points: Point[] }
  | { type: 'unprojected'; id: number; coordinates: LatLng[] }
  | { type: 'error'; code: MapFrameErrorCode }

/**
 * Why the frame can't show a map, or something it couldn't do. `csp` and
 * `bad_message` are reported but keep the map up.
 */
export type MapFrameErrorCode =
  | 'unauthorized'
  | 'rate_limited'
  | 'load_failed'
  | 'unsupported'
  | 'version'
  | 'bad_message'
  | 'csp'

export const FATAL_FRAME_ERRORS: readonly MapFrameErrorCode[] = [
  'unauthorized',
  'rate_limited',
  'load_failed',
  'unsupported',
  'version',
]

export type Envelope<T> = T & {
  protocol: typeof MAPS_FRAME_PROTOCOL
  v: number
}

export const envelope = <T extends object>(message: T): Envelope<T> => ({
  ...message,
  protocol: MAPS_FRAME_PROTOCOL,
  v: MAPS_FRAME_VERSION,
})

// --- Validation. Each side checks everything it receives, and builds its own
// --- copy with only the fields it knows.

type Unknown = Record<string, unknown>

const isObject = (value: unknown): value is Unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const COLOR = /^#[0-9a-f]{6}$/i
const PIN_ID = /^[a-z0-9-]{1,40}$/
const LANGUAGE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,3}$/
/** MapKit JS tokens are JWTs: three base64url parts. */
const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export const isToken = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_TOKEN_LENGTH &&
  TOKEN.test(value)

const latLng = (value: unknown): LatLng | null => {
  if (!isObject(value)) return null
  const { latitude, longitude } = value
  if (
    !isFiniteNumber(latitude) ||
    !isFiniteNumber(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null
  return { latitude, longitude }
}

const region = (value: unknown): Region | null => {
  const center = latLng(value)
  if (!center || !isObject(value)) return null
  const { latitudeDelta, longitudeDelta } = value
  if (
    !isFiniteNumber(latitudeDelta) ||
    !isFiniteNumber(longitudeDelta) ||
    latitudeDelta <= 0 ||
    longitudeDelta <= 0 ||
    latitudeDelta > 180 ||
    longitudeDelta > 360
  )
    return null
  return { ...center, latitudeDelta, longitudeDelta }
}

const point = (value: unknown): Point | null => {
  if (!isObject(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y))
    return null
  return { x: value.x, y: value.y }
}

const size = (value: unknown): Size | null => {
  if (
    !isObject(value) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    value.width < 0 ||
    value.height < 0
  )
    return null
  return { width: value.width, height: value.height }
}

const worldRect = (value: unknown): WorldRect | null => {
  const at = point(value)
  const extent = size(value)
  if (!at || !extent || extent.width <= 0 || extent.height <= 0) return null
  return { ...at, ...extent }
}

const padding = (value: unknown): EdgePadding | null => {
  if (!isObject(value)) return null
  const sides = ['top', 'right', 'bottom', 'left'] as const
  if (
    !sides.every(
      (side) =>
        isFiniteNumber(value[side]) &&
        (value[side] as number) >= 0 &&
        (value[side] as number) < 10_000
    )
  )
    return null
  return {
    top: value.top as number,
    right: value.right as number,
    bottom: value.bottom as number,
    left: value.left as number,
  }
}

const duration = (value: unknown): number | null =>
  isFiniteNumber(value) && value >= 0 && value <= 5000 ? value : null

const list = <T>(
  value: unknown,
  max: number,
  item: (value: unknown) => T | null
): T[] | null => {
  if (!Array.isArray(value) || value.length > max) return null
  const items: T[] = []
  for (const entry of value) {
    const parsed = item(entry)
    if (parsed === null) return null
    items.push(parsed)
  }
  return items
}

const requestId = (value: unknown): number | null =>
  isFiniteNumber(value) && Number.isInteger(value) && value > 0 ? value : null

const options = (value: unknown): MapFrameOptions | null => {
  if (!isObject(value)) return null
  const edges = padding(value.padding)
  if (
    (value.colorScheme !== 'light' && value.colorScheme !== 'dark') ||
    !['standard', 'satellite', 'hybrid'].includes(value.layer as string) ||
    !edges ||
    typeof value.interactive !== 'boolean' ||
    typeof value.showsPointsOfInterest !== 'boolean'
  )
    return null
  return {
    colorScheme: value.colorScheme,
    layer: value.layer as MapFrameLayer,
    padding: edges,
    interactive: value.interactive,
    showsPointsOfInterest: value.showsPointsOfInterest,
  }
}

const pin = (value: unknown): FramePin | null => {
  const at = latLng(value)
  if (!at || !isObject(value)) return null
  if (typeof value.id !== 'string' || !PIN_ID.test(value.id)) return null
  if (typeof value.color !== 'string' || !COLOR.test(value.color)) return null
  if (value.draggable !== undefined && typeof value.draggable !== 'boolean')
    return null
  return {
    id: value.id,
    ...at,
    color: value.color,
    ...(value.draggable && { draggable: true }),
  }
}

const polyline = (value: unknown): FramePolyline | null => {
  if (!isObject(value)) return null
  const { id, coordinates, color, width } = value
  if (typeof id !== 'string' || !PIN_ID.test(id)) return null
  if (typeof color !== 'string' || !COLOR.test(color)) return null
  if (!isFiniteNumber(width) || width <= 0 || width > 40) return null
  if (
    !Array.isArray(coordinates) ||
    coordinates.length % 2 !== 0 ||
    coordinates.length > MAX_POLYLINE_POINTS * 2
  )
    return null
  for (let i = 0; i < coordinates.length; i += 2) {
    if (!latLng({ latitude: coordinates[i], longitude: coordinates[i + 1] }))
      return null
  }
  return { id, coordinates: [...(coordinates as number[])], color, width }
}

const enveloped = (value: unknown): Unknown | null =>
  isObject(value) &&
  value.protocol === MAPS_FRAME_PROTOCOL &&
  typeof value.type === 'string'
    ? value
    : null

/** Whether `value` claims to be this protocol, whatever its version. */
export const isProtocolMessage = (value: unknown): boolean =>
  enveloped(value) !== null

/** Whether a protocol message is for a version this side doesn't speak. */
export const isOtherVersion = (value: unknown): boolean =>
  enveloped(value)?.v !== MAPS_FRAME_VERSION

/**
 * The app's message, rebuilt from what's known, or null when it isn't one
 * (another protocol, version or shape).
 */
export function parseAppMessage(value: unknown): AppMessage | null {
  const message = enveloped(value)
  if (!message || message.v !== MAPS_FRAME_VERSION) return null
  switch (message.type) {
    case 'init': {
      const parsed = options(message.options)
      const camera =
        message.region === undefined ? undefined : region(message.region)
      if (
        !isToken(message.token) ||
        typeof message.language !== 'string' ||
        !LANGUAGE.test(message.language) ||
        !parsed ||
        camera === null
      )
        return null
      return {
        type: 'init',
        token: message.token,
        language: message.language,
        options: parsed,
        ...(camera && { region: camera }),
      }
    }
    case 'token':
      if (message.token !== null && !isToken(message.token)) return null
      return { type: 'token', token: message.token }
    case 'options': {
      const parsed = options(message.options)
      return parsed && { type: 'options', options: parsed }
    }
    case 'camera': {
      const camera = region(message.region)
      const time = duration(message.duration)
      return camera && time !== null
        ? { type: 'camera', region: camera, duration: time }
        : null
    }
    case 'center': {
      const center = latLng(message.center)
      const time = duration(message.duration)
      return center && time !== null
        ? { type: 'center', center, duration: time }
        : null
    }
    case 'fit': {
      const coordinates = list(message.coordinates, MAX_PROJECTED, latLng)
      const edges = padding(message.padding)
      if (!coordinates || !edges || typeof message.animated !== 'boolean')
        return null
      return {
        type: 'fit',
        coordinates,
        padding: edges,
        animated: message.animated,
      }
    }
    case 'pins': {
      const pins = list(message.pins, MAX_PINS, pin)
      return pins && { type: 'pins', pins }
    }
    case 'polylines': {
      const polylines = list(message.polylines, MAX_POLYLINES, polyline)
      return polylines && { type: 'polylines', polylines }
    }
    case 'userLocation': {
      if (message.location === null)
        return { type: 'userLocation', location: null }
      const location = latLng(message.location)
      return location && { type: 'userLocation', location }
    }
    case 'project': {
      const id = requestId(message.id)
      const coordinates = list(message.coordinates, MAX_PROJECTED, latLng)
      return id && coordinates ? { type: 'project', id, coordinates } : null
    }
    case 'unproject': {
      const id = requestId(message.id)
      const points = list(message.points, MAX_PROJECTED, point)
      return id && points ? { type: 'unproject', id, points } : null
    }
    default:
      return null
  }
}

const ERROR_CODES: readonly MapFrameErrorCode[] = [
  'unauthorized',
  'rate_limited',
  'load_failed',
  'unsupported',
  'version',
  'bad_message',
  'csp',
]

/** The frame's message, rebuilt from what's known, or null. */
export function parseFrameMessage(value: unknown): FrameMessage | null {
  const message = enveloped(value)
  if (!message || message.v !== MAPS_FRAME_VERSION) return null
  switch (message.type) {
    case 'ready':
    case 'tokenRequest':
      return { type: message.type }
    case 'region': {
      const camera = region(message.region)
      const rect = worldRect(message.rect)
      const extent = size(message.size)
      if (
        !['start', 'change', 'end'].includes(message.phase as string) ||
        !camera ||
        !rect ||
        !extent ||
        typeof message.byUser !== 'boolean'
      )
        return null
      return {
        type: 'region',
        phase: message.phase as 'start' | 'change' | 'end',
        region: camera,
        rect,
        size: extent,
        byUser: message.byUser,
      }
    }
    case 'press': {
      const coordinate = latLng(message.coordinate)
      if (
        !coordinate ||
        (message.kind !== 'press' && message.kind !== 'longPress')
      )
        return null
      return { type: 'press', kind: message.kind, coordinate }
    }
    case 'pinPress':
      return typeof message.id === 'string' && PIN_ID.test(message.id)
        ? { type: 'pinPress', id: message.id }
        : null
    case 'pinDragEnd': {
      const coordinate = latLng(message.coordinate)
      return coordinate &&
        typeof message.id === 'string' &&
        PIN_ID.test(message.id)
        ? { type: 'pinDragEnd', id: message.id, coordinate }
        : null
    }
    case 'projected': {
      const id = requestId(message.id)
      const points = list(message.points, MAX_PROJECTED, point)
      return id && points ? { type: 'projected', id, points } : null
    }
    case 'unprojected': {
      const id = requestId(message.id)
      const coordinates = list(message.coordinates, MAX_PROJECTED, latLng)
      return id && coordinates ? { type: 'unprojected', id, coordinates } : null
    }
    case 'error':
      return ERROR_CODES.includes(message.code as MapFrameErrorCode)
        ? { type: 'error', code: message.code as MapFrameErrorCode }
        : null
    default:
      return null
  }
}

// --- Origins.

/**
 * Whether `origin` is one of `allowed`: exact origins, or `http://localhost:*`
 * and `http://127.0.0.1:*` for any port of a local server.
 */
export function isAllowedOrigin(
  origin: string,
  allowed: readonly string[]
): boolean {
  for (const entry of allowed) {
    if (entry === origin) return true
    if (entry.endsWith(':*')) {
      const base = entry.slice(0, -2)
      if (!/^http:\/\/(localhost|127\.0\.0\.1)$/.test(base)) continue
      const rest = origin.slice(base.length)
      if (origin.startsWith(base) && /^:\d{1,5}$/.test(rest)) return true
    }
  }
  return false
}
