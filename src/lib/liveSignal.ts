/**
 * A ww-api live signal: one WebSocket that says _that_ something changed on the
 * server (`hello` with the current `seq` on connecting, then `changed`), never
 * what. The Buddies inbox, Cloud Sync and each Shared Car keep one while the
 * app is in the foreground and pull over HTTP when it speaks.
 */

/** The part of a WebSocket the live signal uses. */
export type LiveSocket = {
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: (() => void) | null
  onmessage: ((event: { data?: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: ((event: { code?: number; reason?: string }) => void) | null
}

/** React Native's WebSocket takes headers; the DOM typings don't know it. */
type HeaderWebSocket = new (
  url: string,
  protocols: null,
  options: { headers: Record<string, string> }
) => LiveSocket

/**
 * Opens a WebSocket with request headers (React Native's), so the session and
 * any ids travel in headers and never in the URL.
 */
export const openHeaderSocket = (
  url: string,
  headers: Record<string, string>
): LiveSocket =>
  new (WebSocket as unknown as HeaderWebSocket)(url, null, { headers })

/** Keepalive: answered by the server without waking its Durable Object. */
const PING_INTERVAL_MS = 25 * 1000
/** No pong this long after a ping means the connection is dead. */
const PONG_TIMEOUT_MS = 10 * 1000
/** Waits before reconnecting, longer after each failure in a row. */
const RECONNECT_DELAYS_MS = [1, 2, 5, 15, 30, 60].map((s) => s * 1000)
/** Changes often land in bursts (a card, then an event); one sync covers them. */
const CHANGE_DEBOUNCE_MS = 300

type LiveMessage = { type: 'hello' | 'changed'; seq: number }

function parseMessage(data: unknown): LiveMessage | 'pong' | null {
  if (data === 'pong') return 'pong'
  if (typeof data !== 'string') return null
  try {
    const message = JSON.parse(data) as Partial<LiveMessage>
    if (
      (message.type === 'hello' || message.type === 'changed') &&
      typeof message.seq === 'number'
    )
      return { type: message.type, seq: message.seq }
  } catch {
    // Not a message this version knows.
  }
  return null
}

/** What happened on the live connection, for diagnostics (Tools). */
export type LiveEvent =
  | { type: 'connecting' }
  /** The last connection closed before it opened: checking the session. */
  | { type: 'verify' }
  | { type: 'openFailed'; error: string }
  | { type: 'open' }
  | { type: 'hello'; seq: number; behind: boolean }
  | { type: 'changed'; seq: number }
  | { type: 'ping' }
  | { type: 'pong'; rttMs: number }
  | { type: 'pongTimeout' }
  | { type: 'sync' }
  | { type: 'closed'; code?: number; reason?: string }
  | { type: 'reconnectScheduled'; inMs: number; attempt: number }
  | { type: 'stopped' }

/**
 * What the signal does after the server closes the connection with a code of
 * its own (4001 and up):
 *
 * - `reconnect`: reconnect with backoff, as after any other close.
 * - `sync`: pull now, then reconnect with backoff.
 * - `syncAndStay`: pull now and stay closed until `stop()` and `start()`.
 * - `stay`: stay closed until `stop()` and `start()`.
 */
export type LiveCloseAction = 'reconnect' | 'sync' | 'syncAndStay' | 'stay'

export type LiveSignalDeps = {
  open: () => Promise<LiveSocket>
  /** The `seq` this device has synced to. */
  syncedSeq: () => number
  /**
   * Something changed on the server; pull it. With `seq` (a `hello` past this
   * device's cursor), a sync already past it needn't run again. A `changed`
   * passes none: some changes (a buddy leaving) don't advance `seq`, so it
   * always syncs.
   */
  onChange: (seq?: number) => void
  /**
   * An authorized HTTP call (a sync), run before reconnecting after a
   * connection closed before it opened. React Native can't say why a handshake
   * failed, and an access token the server refused would otherwise be sent
   * again on every reconnect until it expires here; a 401 on this call
   * refreshes it through the session. The connection is tried next whatever it
   * answers, so a sync that fails for another reason never keeps it down.
   */
  verify?: () => Promise<unknown>
  onEvent?: (event: LiveEvent) => void
  /** How a close code is answered; `reconnect` when absent. */
  closeAction?: (code: number | undefined) => LiveCloseAction
  /**
   * The least wait before reconnecting after the server closed with `code`
   * (ms), when the usual backoff would be shorter; none when absent.
   */
  reconnectFloorMs?: (code: number | undefined) => number
  now?: () => number
}

export type LiveSignal = {
  start(): void
  stop(): void
  /**
   * Replaces the connection now, skipping any backoff: for tools, and for a
   * space whose `gone` close a sync showed was wrong (the car is still there).
   */
  reconnect(): void
  /** Sends a keepalive now; the pong's round trip is reported. Tools only. */
  ping(): void
}

/**
 * Keeps one live connection open while started: syncs when the server says
 * something changed, or on connecting when the server moved past what this
 * device has. Reconnects with backoff and detects dead connections with a ping.
 * Pushes, polling and returning to the app still cover the time it's stopped.
 */
export function createLiveSignal(deps: LiveSignalDeps): LiveSignal {
  const now = deps.now ?? Date.now
  const emit = (event: LiveEvent) => deps.onEvent?.(event)
  let running = false
  let socket: LiveSocket | null = null
  let opened = false
  let pingSentAt: number | null = null
  let connecting = false
  /**
   * The last connection closed before it opened (or said anything), as one the
   * server refused does: `verify` runs before the next.
   */
  let refused = false
  let failures = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let pongTimer: ReturnType<typeof setTimeout> | null = null
  let changeTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * What the next sync must reach: a `hello`'s seq, or null once a `changed`
   * came, which always syncs.
   */
  let changedSeq: number | null | undefined

  const clearTimers = () => {
    if (pingTimer) clearInterval(pingTimer)
    if (pongTimer) clearTimeout(pongTimer)
    if (changeTimer) clearTimeout(changeTimer)
    pingTimer = pongTimer = changeTimer = null
    pingSentAt = null
    changedSeq = undefined
  }

  const sync = (seq?: number) => {
    emit({ type: 'sync' })
    deps.onChange(seq)
  }

  const changed = (seq: number | null) => {
    changedSeq =
      seq === null || changedSeq === null
        ? null
        : Math.max(changedSeq ?? seq, seq)
    if (changeTimer) clearTimeout(changeTimer)
    changeTimer = setTimeout(() => {
      changeTimer = null
      const upTo = changedSeq ?? undefined
      changedSeq = undefined
      sync(upTo)
    }, CHANGE_DEBOUNCE_MS)
  }

  const sendPing = (live: LiveSocket) => {
    live.send('ping')
    emit({ type: 'ping' })
    if (pongTimer) return
    pingSentAt = now()
    pongTimer = setTimeout(() => {
      emit({ type: 'pongTimeout' })
      live.close()
    }, PONG_TIMEOUT_MS)
  }

  const scheduleReconnect = (floorMs = 0) => {
    if (!running || reconnectTimer) return
    const delay = Math.max(
      RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length - 1)],
      floorMs
    )
    failures += 1
    // Jitter, so a server restart isn't met by every device at once; never
    // under the floor.
    const inMs = Math.max(
      floorMs,
      Math.round(delay * (0.8 + Math.random() * 0.4))
    )
    emit({ type: 'reconnectScheduled', inMs, attempt: failures })
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, inMs)
  }

  /**
   * Closes a connection that's no longer wanted. React Native on Android can't
   * cancel one that's still connecting, so it may open (and talk) after it was
   * closed: close it again then, now that closing works, and ignore it.
   */
  const discard = (live: LiveSocket) => {
    live.onopen = live.onmessage = () => live.close(1000)
    live.onerror = live.onclose = null
    live.close(1000)
  }

  const attach = (live: LiveSocket) => {
    socket = live
    opened = false
    let heard = false
    /** Dropped or replaced since: see `discard`. */
    const stale = () => {
      if (socket === live) return false
      live.close(1000)
      return true
    }
    live.onopen = () => {
      if (stale()) return
      opened = heard = true
      emit({ type: 'open' })
      pingTimer = setInterval(() => {
        if (!stale()) sendPing(live)
      }, PING_INTERVAL_MS)
    }
    live.onmessage = (event) => {
      if (stale()) return
      heard = true
      const message = parseMessage(event.data)
      if (message === 'pong') {
        if (pongTimer) clearTimeout(pongTimer)
        pongTimer = null
        if (pingSentAt !== null)
          emit({ type: 'pong', rttMs: now() - pingSentAt })
        pingSentAt = null
      } else if (message?.type === 'hello') {
        failures = 0
        const behind = message.seq > deps.syncedSeq()
        emit({ type: 'hello', seq: message.seq, behind })
        if (behind) changed(message.seq)
      } else if (message?.type === 'changed') {
        emit({ type: 'changed', seq: message.seq })
        changed(null)
      }
    }
    live.onerror = () => {
      // onclose follows and reconnects.
    }
    live.onclose = (event) => {
      if (socket !== live) return
      if (!heard) refused = true
      socket = null
      opened = false
      clearTimers()
      emit({ type: 'closed', code: event.code, reason: event.reason })
      const action = deps.closeAction?.(event.code) ?? 'reconnect'
      if ((action === 'sync' || action === 'syncAndStay') && running) sync()
      if (action === 'syncAndStay' || action === 'stay') return
      scheduleReconnect(deps.reconnectFloorMs?.(event.code) ?? 0)
    }
  }

  const connect = () => {
    if (!running || socket || connecting) return
    connecting = true
    emit({ type: 'connecting' })
    const verify = refused ? deps.verify : undefined
    if (verify) emit({ type: 'verify' })
    const verified = verify
      ? Promise.resolve()
          .then(verify)
          .catch(() => undefined)
      : Promise.resolve()
    verified
      .then(() => {
        refused = false
        // Stopped while checking: opening now would only be closed again.
        return running ? deps.open() : null
      })
      .then(
        (live) => {
          connecting = false
          if (!live) return
          if (running && !socket) attach(live)
          else discard(live)
        },
        (error: unknown) => {
          connecting = false
          emit({
            type: 'openFailed',
            error: error instanceof Error ? error.message : String(error),
          })
          scheduleReconnect()
        }
      )
  }

  /** Drops the current connection without reconnecting. */
  const drop = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    clearTimers()
    const live = socket
    socket = null
    opened = false
    live?.close(1000)
  }

  return {
    start() {
      if (running) return
      running = true
      failures = 0
      connect()
    },
    stop() {
      if (!running) return
      running = false
      drop()
      emit({ type: 'stopped' })
    },
    reconnect() {
      if (!running) return
      drop()
      failures = 0
      connect()
    },
    ping() {
      if (socket && opened) sendPing(socket)
    },
  }
}
