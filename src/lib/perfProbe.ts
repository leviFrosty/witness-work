/**
 * The profiling probe's reporters (see `@/lib/perf`). Only active in bundles
 * built with `EXPO_PUBLIC_PERF_PROBE=1`.
 */
import { AppState } from 'react-native'
import { counters, now, perf, perfProbeEnabled } from '@/lib/perf'

type Counters = Record<string, number>

/** Window after a launch or foreground in which work is attributed to it. */
const SETTLE_WINDOW_MS = 8000
/** Event-loop lag below this is normal scheduling, not blocking work. */
const BLOCKING_THRESHOLD_MS = 50
const LAG_SAMPLE_MS = 16

/**
 * Measures how long the JS thread was blocked over a window: the sum of each
 * timer tick's lateness past `BLOCKING_THRESHOLD_MS` (like Total Blocking
 * Time).
 */
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

/** Hermes heap figures, or null on another engine. */
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

/** Os_log truncates messages near 1 KB (logcat near 4 KB). */
const MAX_LINE = 800

/**
 * Prints a report for scripts/perf, which reads it from the device log. Stays
 * out of the logger, which is silent in release builds. Longer reports go out
 * as numbered `[ww-perf~<id>:<i>/<n>]` parts.
 */
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

/**
 * Starts the probe's reporters. Launch: once navigation is ready, reports the
 * milestones and what ran during the settle window. Foreground: the same for
 * each return from the background.
 */
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

/** Called from NavigationContainer.onReady: the first screen is up. */
export function reportLaunch(): void {
  perf.mark('navReady')
  if (!perfProbeEnabled) return
  // Wall clock at the first screen, for the runner's launch-to-screen time.
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
    // The host and the first three path segments name the endpoint well
    // enough. Ids and tokens in the path (long, with digits) become `:id`, so
    // one endpoint stays one counter and reports carry no tokens.
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

/**
 * Counts every fetch (Expo installs its own native fetch, which bypasses
 * XMLHttpRequest), XMLHttpRequest (axios) and WebSocket, by endpoint. Native
 * SDK traffic (RevenueCat, iCloud) is counted at its JS call sites instead.
 */
function countNetworkRequests() {
  // A fetch built on XMLHttpRequest opens it synchronously; count it once.
  let inFetch = 0
  const open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    if (!inFetch) countRequest(String(url))
    // @ts-expect-error forwarding the overloads' optional arguments
    return open.call(this, method, url, ...rest)
  }
  // Reading it first resolves Expo's lazy global.
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
      // @ts-expect-error constructing the wrapped native class
      return new NativeWebSocket(url, ...rest)
    } as unknown as typeof WebSocket
    Counted.prototype = NativeWebSocket.prototype
    // Static ready-state constants are non-enumerable, so copy them by name.
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const)
      Object.defineProperty(Counted, key, { value: NativeWebSocket[key] })
    globalThis.WebSocket = Counted
  }
}
