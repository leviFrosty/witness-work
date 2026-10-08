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

function report(payload: Record<string, unknown>) {
  if (!perfProbeEnabled) return
  // Read by scripts/perf from the device log; stays out of the logger, which
  // is silent in release builds.
  console.log(`[ww-perf] ${JSON.stringify(payload)}`)
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
      report({
        type: kind,
        at: Date.now(),
        windowMs: Math.round(now() - startedAt),
        blockedMs,
        counters: diff(counters, before),
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
    report({
      type: 'launch',
      at: Date.now(),
      wallNavReady,
      blockedMsAfterReady: blockedMs,
      ...perf.snapshot(),
      countersAfterReady: diff(counters, before),
    })
  )
}

function requestKey(url: string): string {
  try {
    const parsed = new URL(url)
    // Ids and tokens live in query strings; the host and the first two path
    // segments name the endpoint well enough.
    const path = parsed.pathname.split('/').filter(Boolean).slice(0, 3)
    return `net:${parsed.host}/${path.join('/')}`
  } catch {
    return 'net:unparsed'
  }
}

/**
 * Counts every XMLHttpRequest (React Native's fetch and axios both use it) and
 * WebSocket, by endpoint. Native SDK traffic (RevenueCat, iCloud) is counted at
 * its JS call sites instead.
 */
function countNetworkRequests() {
  const open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    perf.count('net:total')
    perf.count(requestKey(String(url)))
    // @ts-expect-error forwarding the overloads' optional arguments
    return open.call(this, method, url, ...rest)
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
