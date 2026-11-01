import { AppState } from 'react-native'
import { counters, now, perf, perfProbeEnabled } from '@/lib/perf'

type Counters = Record<string, number>

const SETTLE_WINDOW_MS = 8000

const BLOCKING_THRESHOLD_MS = 50
const LAG_SAMPLE_MS = 16

function measureBlocking(windowMs: number): Promise<number> {
  return new Promise((resolve) => {
    let blocked = 0
    let last = now()
    const end = last + windowMs
    const tick = () => {
      const current = now()
      const lag = current - last - LAG_SAMPLE_MS
      if (lag > BLOCKING_THRESHOLD_MS) blocked += lag
      last = current
      if (current >= end) resolve(Math.round(blocked))
      else setTimeout(tick, LAG_SAMPLE_MS)
    }
    setTimeout(tick, LAG_SAMPLE_MS)
  })
}

function diff(after: Counters, before: Counters): Counters {
  const result: Counters = {}
  for (const [key, value] of Object.entries(after)) {
    const delta = value - (before[key] ?? 0)
    if (delta) result[key] = delta
  }
  return result
}

function jsHeap() {
  const stats = (
    globalThis as {
      HermesInternal?: { getInstrumentedStats?: () => Record<string, number> }
    }
  ).HermesInternal?.getInstrumentedStats?.()
  if (!stats) return null
  return {
    heapSize: stats.js_heapSize,
    allocatedBytes: stats.js_allocatedBytes,
    numGCs: stats.js_numGCs,
  }
}

const MAX_LINE = 800

export function reportPerf(payload: Record<string, unknown>) {
  if (!perfProbeEnabled) return
  const json = JSON.stringify(payload)
  if (json.length <= MAX_LINE) {
    console.log(`[ww-perf] ${json}`)
    return
  }
  const id = Math.random().toString(36).slice(2, 8)
  const total = Math.ceil(json.length / MAX_LINE)
  for (let i = 0; i < total; i++)
    console.log(
      `[ww-perf~${id}:${i + 1}/${total}] ${json.slice(i * MAX_LINE, (i + 1) * MAX_LINE)}`
    )
}

let installed = false

export function installPerfProbe(): void {
  if (installed || !perfProbeEnabled) return
  installed = true
  countNetworkRequests()

  let backgrounded = false
  AppState.addEventListener('change', (state) => {
    if (state === 'background') backgrounded = true
    if (state !== 'active') return
    const kind = backgrounded ? 'foreground' : 'active'
    backgrounded = false
    const before = { ...counters }
    const startedAt = now()
    void measureBlocking(SETTLE_WINDOW_MS).then((blockedMs) =>
      reportPerf({
        type: kind,
        at: Date.now(),
        windowMs: Math.round(now() - startedAt),
        blockedMs,
        counters: diff(counters, before),
        jsHeap: jsHeap(),
      })
    )
  })
}

export function reportLaunch(): void {
  perf.mark('navReady')
  if (!perfProbeEnabled) return

  const wallNavReady = Date.now()
  const before = { ...counters }
  void measureBlocking(SETTLE_WINDOW_MS).then((blockedMs) =>
    reportPerf({
      type: 'launch',
      at: Date.now(),
      wallNavReady,
      blockedMsAfterReady: blockedMs,
      ...perf.snapshot(),
      countersAfterReady: diff(counters, before),
      jsHeap: jsHeap(),
    })
  )
}

function requestKey(url: string): string {
  try {
    const parsed = new URL(url)

    const path = parsed.pathname
      .split('/')
      .filter(Boolean)
      .slice(0, 3)
      .map((segment) =>
        segment.length >= 16 && /\d/.test(segment) ? ':id' : segment
      )
    return `net:${parsed.host}/${path.join('/')}`
  } catch {
    return 'net:unparsed'
  }
}

function countRequest(url: string) {
  perf.count('net:total')
  perf.count(requestKey(url))
}

function countNetworkRequests() {
  let inFetch = 0
  const open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    if (!inFetch) countRequest(String(url))

    return (open as (...args: unknown[]) => void).call(
      this,
      method,
      url,
      ...rest
    )
  }

  const nativeFetch = globalThis.fetch
  if (nativeFetch) {
    const counted: typeof fetch = (input, init) => {
      countRequest(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      )
      inFetch++
      try {
        return nativeFetch(input, init)
      } finally {
        inFetch--
      }
    }
    Object.defineProperty(globalThis, 'fetch', {
      value: counted,
      writable: true,
      configurable: true,
    })
  }
  const NativeWebSocket = globalThis.WebSocket
  if (NativeWebSocket) {
    const Counted = function (this: unknown, url: string, ...rest: unknown[]) {
      perf.count('ws:open')
      perf.count(`ws:${requestKey(url).slice(4)}`)

      return new (NativeWebSocket as unknown as new (
        url: string,
        ...rest: unknown[]
      ) => WebSocket)(url, ...rest)
    } as unknown as typeof WebSocket
    Counted.prototype = NativeWebSocket.prototype

    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const)
      Object.defineProperty(Counted, key, { value: NativeWebSocket[key] })
    globalThis.WebSocket = Counted
  }
}
