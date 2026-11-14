type HttpEntry = {
  kind: 'http'
  id: number
  at: number
  wall: number
  appState: string
  method: string
  url: string
  reqHeaderNames: string[]
  reqHeaderBytes: number
  reqBytes: number | null
  reqEncoding: string | null
  status: number | null
  ttfbMs: number | null
  totalMs: number | null
  resBytes: number | null
  resHeaderBytes: number | null
  resHeaders: Record<string, string>
  outcome: 'pending' | 'load' | 'error' | 'timeout' | 'abort'
  initiator: string[]
}

type SocketEntry = {
  kind: 'ws'
  id: number
  at: number
  wall: number
  appState: string
  url: string
  openMs: number | null
  closedAt: number | null
  closeCode: number | null
  sent: number
  sentBytes: number
  received: number
  receivedBytes: number
  initiator: string[]
}

type MarkEntry = { kind: 'mark'; at: number; wall: number; label: string }

type Entry = HttpEntry | SocketEntry | MarkEntry

const KEPT_RESPONSE_HEADERS = [
  'content-length',
  'content-encoding',
  'content-type',
  'cache-control',
  'etag',
  'age',
  'cf-cache-status',
  'server-timing',
  'access-control-max-age',
  'x-cache',
]

const NOISE =
  /^(send|fetch|anonymous|tryCallOne|tryCallTwo|doResolve|Promise|asyncGeneratorStep|_next|_throw|next|apply|call|step|flush|processTicksAndRejections|__callReactNativeMicrotasks|__guard|callReactNativeMicrotasks|flushedQueue|invokeCallbackAndReturnFlushedQueue|callFunctionReturnFlushedQueue|__callFunction|_callTimer|callTimers|emit|open|counted|install|recordSend|initiator)$/

const MAX_ENTRIES = 4000

const epoch = Date.now()
const entries: Entry[] = []
let nextId = 1
let appState = 'launch'
let installed = false

const since = () => Date.now() - epoch

function push(entry: Entry) {
  entries.push(entry)
  if (entries.length > MAX_ENTRIES)
    entries.splice(0, entries.length - MAX_ENTRIES)
}

function utf8Length(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

function sizeOf(body: unknown): number | null {
  if (body === null || body === undefined) return 0
  if (typeof body === 'string') return utf8Length(body)
  const sized = body as { byteLength?: unknown; size?: unknown }
  if (typeof sized.byteLength === 'number') return sized.byteLength
  if (typeof sized.size === 'number') return sized.size
  return null
}

function initiator(): string[] {
  const stack = new Error().stack ?? ''
  const names: string[] = []
  for (const line of stack.split('\n').slice(1)) {
    const match = /^\s*at\s+([^\s(]+)/.exec(line)
    if (!match) continue
    const name = match[1].replace(/^async\s+/, '')
    const short = name.split('.').pop() ?? name
    if (NOISE.test(short) || short.startsWith('?')) continue
    if (names[names.length - 1] !== name) names.push(name)
    if (names.length >= 10) break
  }
  return names
}

function parseHeaders(raw: string): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index <= 0) continue
    const name = line.slice(0, index).trim().toLowerCase()
    if (KEPT_RESPONSE_HEADERS.includes(name))
      kept[name] = line.slice(index + 1).trim()
  }
  return kept
}

function recordXhr() {
  const proto = XMLHttpRequest.prototype
  const open = proto.open
  const setRequestHeader = proto.setRequestHeader
  const send = proto.send
  const pending = new WeakMap<XMLHttpRequest, HttpEntry>()

  proto.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    pending.set(this, {
      kind: 'http',
      id: nextId++,
      at: 0,
      wall: 0,
      appState,
      method: String(method).toUpperCase(),
      url: String(url),
      reqHeaderNames: [],
      reqHeaderBytes: 0,
      reqBytes: null,
      reqEncoding: null,
      status: null,
      ttfbMs: null,
      totalMs: null,
      resBytes: null,
      resHeaderBytes: null,
      resHeaders: {},
      outcome: 'pending',
      initiator: [],
    })
    return (open as (...args: unknown[]) => void).call(
      this,
      method,
      url,
      ...rest
    )
  }

  proto.setRequestHeader = function (
    this: XMLHttpRequest,
    name: string,
    value: string
  ) {
    const entry = pending.get(this)
    if (entry) {
      entry.reqHeaderNames.push(name.toLowerCase())
      entry.reqHeaderBytes += name.length + String(value).length + 4
      if (name.toLowerCase() === 'content-encoding')
        entry.reqEncoding = String(value)
    }
    return setRequestHeader.call(this, name, value)
  }

  proto.send = function (this: XMLHttpRequest, body?: unknown) {
    const entry = pending.get(this)
    if (entry) {
      const started = Date.now()
      entry.at = started - epoch
      entry.wall = started
      entry.appState = appState
      entry.reqBytes = sizeOf(body)
      entry.initiator = initiator()
      push(entry)
      this.addEventListener('readystatechange', () => {
        if (this.readyState === 2 && entry.ttfbMs === null)
          entry.ttfbMs = Date.now() - started
      })
      const finish = (outcome: HttpEntry['outcome']) => () => {
        if (entry.outcome !== 'pending') return
        entry.outcome = outcome
        entry.totalMs = Date.now() - started
        entry.status = this.status || null
        try {
          const raw = this.getAllResponseHeaders() ?? ''
          entry.resHeaderBytes = raw.length
          entry.resHeaders = parseHeaders(raw)
        } catch {}
        try {
          entry.resBytes =
            this.responseType === '' || this.responseType === 'text'
              ? utf8Length(this.responseText ?? '')
              : sizeOf(this.response)
        } catch {}
      }
      this.addEventListener('load', finish('load'))
      this.addEventListener('error', finish('error'))
      this.addEventListener('timeout', finish('timeout'))
      this.addEventListener('abort', finish('abort'))
    }
    return (send as (body?: unknown) => void).call(this, body)
  }
}

function headerPairs(headers: unknown): [string, string][] {
  if (!headers) return []
  if (Array.isArray(headers)) return headers as [string, string][]
  const iterable = headers as { forEach?: unknown }
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const pairs: [string, string][] = []
    headers.forEach((value, name) => pairs.push([name, value]))
    return pairs
  }
  if (typeof iterable.forEach === 'function') return []
  return Object.entries(headers as Record<string, string>)
}

function recordFetch() {
  const native = globalThis.fetch
  if (!native) return
  const recorded = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const request =
      typeof input === 'string' || input instanceof URL ? null : input
    const started = Date.now()
    const pairs = headerPairs(init?.headers ?? request?.headers)
    const entry: HttpEntry = {
      kind: 'http',
      id: nextId++,
      at: started - epoch,
      wall: started,
      appState,
      method: String(init?.method ?? request?.method ?? 'GET').toUpperCase(),
      url: request ? request.url : String(input),
      reqHeaderNames: pairs.map(([name]) => name.toLowerCase()),
      reqHeaderBytes: pairs.reduce(
        (sum, [name, value]) => sum + name.length + String(value).length + 4,
        0
      ),
      reqBytes: sizeOf(init?.body),
      reqEncoding:
        pairs.find(
          ([name]) => name.toLowerCase() === 'content-encoding'
        )?.[1] ?? null,
      status: null,
      ttfbMs: null,
      totalMs: null,
      resBytes: null,
      resHeaderBytes: null,
      resHeaders: {},
      outcome: 'pending',
      initiator: initiator(),
    }
    push(entry)
    let response: Response
    try {
      response = await native(input as RequestInfo, init)
    } catch (error) {
      entry.outcome =
        (error as { name?: string })?.name === 'AbortError' ||
        init?.signal?.aborted
          ? 'abort'
          : 'error'
      entry.totalMs = Date.now() - started
      throw error
    }
    entry.status = response.status
    entry.ttfbMs = Date.now() - started
    let headerBytes = 0
    response.headers.forEach((value, name) => {
      headerBytes += name.length + value.length + 4
      if (KEPT_RESPONSE_HEADERS.includes(name.toLowerCase()))
        entry.resHeaders[name.toLowerCase()] = value
    })
    entry.resHeaderBytes = headerBytes
    const done = (bytes: number | null) => {
      entry.outcome = 'load'
      entry.totalMs = Date.now() - started
      entry.resBytes = bytes
    }
    const target = response as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >
    const measure: Record<string, (value: unknown) => number | null> = {
      text: (value) => utf8Length(String(value)),
      json: (value) => utf8Length(JSON.stringify(value) ?? ''),
      arrayBuffer: (value) => sizeOf(value),
      bytes: (value) => sizeOf(value),
      blob: (value) => sizeOf(value),
    }
    for (const [method, size] of Object.entries(measure)) {
      const original = target[method]
      if (typeof original !== 'function') continue
      target[method] = async (...args: unknown[]) => {
        const value = await original.apply(response, args)
        done(size(value))
        return value
      }
    }
    return response
  }
  Object.defineProperty(globalThis, 'fetch', {
    value: recorded,
    writable: true,
    configurable: true,
  })
}

function recordWebSockets() {
  const Native = globalThis.WebSocket
  if (!Native) return
  const Recorded = function (this: unknown, url: string, ...rest: unknown[]) {
    const socket = new (Native as unknown as new (
      url: string,
      ...rest: unknown[]
    ) => WebSocket)(url, ...rest)
    const started = Date.now()
    const entry: SocketEntry = {
      kind: 'ws',
      id: nextId++,
      at: started - epoch,
      wall: started,
      appState,
      url: String(url),
      openMs: null,
      closedAt: null,
      closeCode: null,
      sent: 0,
      sentBytes: 0,
      received: 0,
      receivedBytes: 0,
      initiator: initiator(),
    }
    push(entry)
    socket.addEventListener('open', () => {
      entry.openMs = Date.now() - started
    })
    socket.addEventListener('message', (event: { data?: unknown }) => {
      entry.received++
      entry.receivedBytes += sizeOf(event.data) ?? 0
    })
    socket.addEventListener('close', (event: { code?: number }) => {
      entry.closedAt = since()
      entry.closeCode = event.code ?? null
    })
    const send = socket.send.bind(socket)
    socket.send = (data: Parameters<WebSocket['send']>[0]) => {
      entry.sent++
      entry.sentBytes += sizeOf(data) ?? 0
      return send(data)
    }
    return socket
  } as unknown as typeof WebSocket
  Recorded.prototype = Native.prototype
  for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const)
    Object.defineProperty(Recorded, key, { value: Native[key] })
  globalThis.WebSocket = Recorded
}

const api = {
  epoch,
  mark: (label: string) => {
    push({ kind: 'mark', at: since(), wall: Date.now(), label })
    return 'ok'
  },
  count: () => entries.length,
  dump: (from = 0, limit = 60) => ({
    epoch,
    now: since(),
    total: entries.length,
    entries: entries.slice(from, from + limit),
  }),
  clear: () => {
    entries.length = 0
    return 'ok'
  },
}

export function installNetworkLog(): void {
  if (installed || typeof XMLHttpRequest === 'undefined') return
  if (typeof document !== 'undefined') return
  installed = true
  require('expo')
  recordXhr()
  recordFetch()
  recordWebSockets()
  ;(globalThis as { __WW_NET__?: typeof api }).__WW_NET__ = api
  setTimeout(() => {
    const { AppState } =
      require('react-native') as typeof import('react-native')
    appState = AppState.currentState ?? 'unknown'
    AppState.addEventListener('change', (state) => {
      appState = state
      api.mark(`appState:${state}`)
    })
  }, 0)
}
