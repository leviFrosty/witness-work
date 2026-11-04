// The frame's side of the protocol (docs/web-maps.md): which messages it
// takes, from whom, and where it answers. The map itself is an engine: MapKit
// JS in the deployed frame (`mapkitEngine.ts`), a plain drawing in the test
// double (`e2e/web/mapsFrameDouble.ts`), so both run this same code.
import {
  envelope,
  type FrameMessage,
  type FramePin,
  type FramePolyline,
  type EdgePadding,
  isAllowedOrigin,
  isOtherVersion,
  isProtocolMessage,
  type LatLng,
  type MapFrameErrorCode,
  type MapFrameOptions,
  parseAppMessage,
  type Point,
  type Region,
} from '../../../src/lib/mapsFrame/protocol'

export type EngineStart = {
  language: string
  options: MapFrameOptions
  region?: Region
  /** MapKit's `authorizationCallback`: the first token, then fresh ones. */
  token: () => Promise<string | null>
}

/** A map the frame draws, and tells the controller about. */
export interface MapEngine {
  start(
    start: EngineStart,
    emit: (message: FrameMessage) => void
  ): Promise<void>
  setOptions(options: MapFrameOptions): void
  setCamera(region: Region, duration: number): void
  setCenter(center: LatLng, duration: number): void
  fit(coordinates: LatLng[], padding: EdgePadding, animated: boolean): void
  setPins(pins: FramePin[]): void
  setPolylines(polylines: FramePolyline[]): void
  setUserLocation(location: LatLng | null): void
  /** Points in the map's own box, from its top left. */
  project(coordinates: LatLng[]): Point[]
  unproject(points: Point[]): LatLng[]
}

export type IncomingMessage = {
  origin: string
  source: unknown
  data: unknown
}

/** How long the frame waits for a token it asked for. */
export const TOKEN_WAIT_MS = 15_000

export function createFrameController({
  allowedOrigins,
  parent,
  engine,
  setTimer = setTimeout,
}: {
  /** The app origins that may frame this one (`isAllowedOrigin`). */
  allowedOrigins: readonly string[]
  /** The window that framed this one; null when it's the top window. */
  parent: { postMessage(message: unknown, targetOrigin: string): void } | null
  engine: MapEngine
  setTimer?: (run: () => void, ms: number) => unknown
}) {
  /** The app's exact origin, from its first valid `init`; then only it. */
  let appOrigin: string | null = null
  let failed = false
  const tokenWaiters: ((token: string | null) => void)[] = []
  let firstToken: string | null = null

  const post = (message: FrameMessage) => {
    if (!parent || !appOrigin) return
    // Never `*`: only the app that framed this one hears it.
    parent.postMessage(envelope(message), appOrigin)
  }

  const fail = (code: MapFrameErrorCode) => {
    post({ type: 'error', code })
  }

  const emit = (message: FrameMessage) => {
    if (message.type === 'error' && message.code !== 'csp') failed = true
    post(message)
  }

  /** The init's token first; later, ask the app and wait for its answer. */
  const token = () => {
    if (firstToken) {
      const first = firstToken
      firstToken = null
      return Promise.resolve<string | null>(first)
    }
    return new Promise<string | null>((resolve) => {
      let settled = false
      const settle = (value: string | null) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      tokenWaiters.push(settle)
      setTimer(() => settle(null), TOKEN_WAIT_MS)
      post({ type: 'tokenRequest' })
    })
  }

  function receive({ origin, source, data }: IncomingMessage) {
    // Only the window that framed this one, from an app origin, and once it
    // has spoken, only that same origin.
    if (!parent || source !== parent) return
    if (!isAllowedOrigin(origin, allowedOrigins)) return
    if (appOrigin !== null && origin !== appOrigin) return
    if (!isProtocolMessage(data)) return
    if (isOtherVersion(data)) {
      // Say so to an app that's newer or older than this frame.
      const answer = appOrigin ?? origin
      parent.postMessage(envelope({ type: 'error', code: 'version' }), answer)
      return
    }
    const message = parseAppMessage(data)
    if (!message) {
      if (appOrigin) fail('bad_message')
      return
    }
    if (appOrigin === null) {
      if (message.type !== 'init') return
      appOrigin = origin
      firstToken = message.token
      void engine
        .start(
          {
            language: message.language,
            options: message.options,
            region: message.region,
            token,
          },
          emit
        )
        .catch(() => {
          if (!failed) emit({ type: 'error', code: 'load_failed' })
        })
      return
    }
    switch (message.type) {
      case 'init':
        // One map per frame.
        return
      case 'token':
        tokenWaiters.splice(0).forEach((settle) => settle(message.token))
        return
      case 'options':
        engine.setOptions(message.options)
        return
      case 'camera':
        engine.setCamera(message.region, message.duration)
        return
      case 'center':
        engine.setCenter(message.center, message.duration)
        return
      case 'fit':
        engine.fit(message.coordinates, message.padding, message.animated)
        return
      case 'pins':
        engine.setPins(message.pins)
        return
      case 'polylines':
        engine.setPolylines(message.polylines)
        return
      case 'userLocation':
        engine.setUserLocation(message.location)
        return
      case 'project':
        post({
          type: 'projected',
          id: message.id,
          points: engine.project(message.coordinates),
        })
        return
      case 'unproject':
        post({
          type: 'unprojected',
          id: message.id,
          coordinates: engine.unproject(message.points),
        })
        return
    }
  }

  return {
    receive,
    /** Reports a problem the page saw itself, such as a CSP violation. */
    report: fail,
    /** The app this frame answers, once it has framed it. */
    appOrigin: () => appOrigin,
  }
}
