import {
  type AppMessage,
  envelope,
  type EdgePadding,
  FATAL_FRAME_ERRORS,
  type FrameMessage,
  type FramePin,
  type FramePolyline,
  type LatLng,
  type MapFrameErrorCode,
  type MapFrameOptions,
  parseFrameMessage,
  type Point,
  type Region,
} from '@/lib/mapsFrame/protocol'
import type {
  MapKitTokenResult,
  MapUnavailableReason,
} from '@/vendor/web/maps/mapkitTokens'

export type FrameStatus =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'unavailable'; reason: MapUnavailableReason }

export type FrameEvent = Extract<
  FrameMessage,
  { type: 'region' | 'press' | 'pinPress' | 'pinDragEnd' }
>

type Target = { postMessage(message: unknown, targetOrigin: string): void }

export const READY_TIMEOUT_MS = 20_000

export const REQUEST_TIMEOUT_MS = 5_000

type Camera =
  | { type: 'camera'; region: Region; duration: number }
  | { type: 'center'; center: LatLng; duration: number }
  | {
      type: 'fit'
      coordinates: LatLng[]
      padding: EdgePadding
      animated: boolean
    }

const reasonForError = (code: MapFrameErrorCode): MapUnavailableReason =>
  code === 'rate_limited' ? 'busy' : 'failed'

export function createFrameClient({
  origin,
  target,
  token,
  resetToken,
  onEvent,
  onStatus,
  onProblem = () => {},
  isOnline = () => true,
  setTimer = (run, ms) => setTimeout(run, ms),
  clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: {
  origin: string

  target: () => Target | null
  token: () => Promise<MapKitTokenResult>
  resetToken: () => void
  onEvent: (event: FrameEvent) => void
  onStatus: (status: FrameStatus) => void

  onProblem?: (code: MapFrameErrorCode) => void
  isOnline?: () => boolean
  setTimer?: (run: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}) {
  let status: FrameStatus = { state: 'loading' }
  let loaded = false
  let initToken: string | null = null
  let init: {
    language: string
    options: MapFrameOptions
    region?: Region
  } | null = null
  let readyTimer: unknown = null
  let disposed = false

  let options: MapFrameOptions | null = null
  let pins: FramePin[] = []
  let polylines: FramePolyline[] = []
  let userLocation: LatLng | null = null
  let camera: Camera | null = null
  let nextId = 1
  const requests = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: unknown
    }
  >()

  const setStatus = (next: FrameStatus) => {
    if (disposed) return
    status = next
    onStatus(next)
  }

  const fail = (reason: MapUnavailableReason) => {
    if (status.state === 'unavailable') return
    if (readyTimer) clearTimer(readyTimer)
    for (const [id, request] of requests) {
      clearTimer(request.timer)
      request.reject(new Error('maps frame unavailable'))
      requests.delete(id)
    }
    setStatus({ state: 'unavailable', reason })
  }

  const post = (message: AppMessage) => {
    if (disposed) return

    target()?.postMessage(envelope(message), origin)
  }

  const ready = () => status.state === 'ready'

  const sendInit = () => {
    if (!loaded || !initToken || !init || status.state !== 'loading') return
    const region = camera?.type === 'camera' ? camera.region : init.region
    post({
      type: 'init',
      token: initToken,
      language: init.language,
      options: options ?? init.options,
      ...(region && { region }),
    })
    initToken = null
    readyTimer = setTimer(
      () => fail(isOnline() ? 'failed' : 'offline'),
      READY_TIMEOUT_MS
    )
  }

  const flush = () => {
    if (options) post({ type: 'options', options })
    post({ type: 'pins', pins })
    post({ type: 'polylines', polylines })
    if (userLocation) post({ type: 'userLocation', location: userLocation })
    if (camera && camera.type !== 'camera') post(camera)
    camera = null
  }

  const request = <T>(message: AppMessage & { id: number }) =>
    new Promise<T>((resolve, reject) => {
      if (!ready()) return reject(new Error('maps frame not ready'))
      const timer = setTimer(() => {
        requests.delete(message.id)
        reject(new Error('maps frame did not answer'))
      }, REQUEST_TIMEOUT_MS)
      requests.set(message.id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })
      post(message)
    })

  const answer = (id: number, value: unknown) => {
    const pending = requests.get(id)
    if (!pending) return
    clearTimer(pending.timer)
    requests.delete(id)
    pending.resolve(value)
  }

  return {
    status: () => status,

    start(next: {
      language: string
      options: MapFrameOptions
      region?: Region
    }) {
      init = next
      void token().then((result) => {
        if (disposed) return
        if (!result.ok) return fail(result.reason)
        initToken = result.token
        sendInit()
      })
    },

    frameLoaded() {
      loaded = true
      sendInit()
    },
    receive({
      origin: from,
      source,
      data,
    }: {
      origin: string
      source: unknown
      data: unknown
    }) {
      const frame = target()
      if (disposed || !frame || source !== frame || from !== origin) return
      const message = parseFrameMessage(data)
      if (!message) return
      switch (message.type) {
        case 'ready':
          if (status.state !== 'loading') return
          if (readyTimer) clearTimer(readyTimer)
          setStatus({ state: 'ready' })
          flush()
          return
        case 'tokenRequest':
          resetToken()
          void token().then((result) =>
            post({ type: 'token', token: result.ok ? result.token : null })
          )
          return
        case 'error':
          if (FATAL_FRAME_ERRORS.includes(message.code)) {
            if (message.code === 'unauthorized') resetToken()
            fail(reasonForError(message.code))
          } else onProblem(message.code)
          return
        case 'projected':
          answer(message.id, message.points)
          return
        case 'unprojected':
          answer(message.id, message.coordinates)
          return
        default:
          if (ready()) onEvent(message)
      }
    },
    setOptions(next: MapFrameOptions) {
      options = next
      if (ready()) post({ type: 'options', options: next })
    },
    setPins(next: FramePin[]) {
      pins = next
      if (ready()) post({ type: 'pins', pins: next })
    },
    setPolylines(next: FramePolyline[]) {
      polylines = next
      if (ready()) post({ type: 'polylines', polylines: next })
    },
    setUserLocation(next: LatLng | null) {
      userLocation = next
      if (ready()) post({ type: 'userLocation', location: next })
    },

    move(next: Camera) {
      if (ready()) post(next)
      else camera = next
    },
    project: (coordinates: LatLng[]) =>
      request<Point[]>({ type: 'project', id: nextId++, coordinates }),
    unproject: (points: Point[]) =>
      request<LatLng[]>({ type: 'unproject', id: nextId++, points }),
    dispose() {
      if (readyTimer) clearTimer(readyTimer)
      for (const request of requests.values()) {
        clearTimer(request.timer)
        request.reject(new Error('maps frame closed'))
      }
      requests.clear()
      disposed = true
    },
  }
}

export type FrameClient = ReturnType<typeof createFrameClient>
