import type { LiveSocket } from '@/features/buddies/lib/relay'
import { LIVE_CLOSE_EXPIRED } from '@/lib/serverAccount/liveTicket'

/** Keepalive: answered by the relay without waking the inbox. */
const PING_INTERVAL_MS = 25 * 1000
/** No pong this long after a ping means the connection is dead. */
const PONG_TIMEOUT_MS = 10 * 1000
/** Waits before reconnecting, longer after each failure in a row. */
const RECONNECT_DELAYS_MS = [1, 2, 5, 15, 30, 60].map((s) => s * 1000)
/** Changes often land in bursts (a card, then an event); one sync covers them. */
const CHANGE_DEBOUNCE_MS = 300

/** The relay closed the socket because the inbox is gone. */
const CLOSE_GONE = 4001
/** The relay closed the socket because the inbox's account is suspended. */
const CLOSE_SUSPENDED = 4003
/** At most one immediate reconnect for an expired token this often. */
const EXPIRED_RECONNECT_MS = 10 * 1000

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

export type LiveInboxDeps = {
  open: () => Promise<LiveSocket>
  /** The inbox seq this device has synced to. */
  syncedSeq: () => number
  /**
   * Something changed in the inbox; pull it. With `seq` (a `hello` past this
   * device's cursor), a sync already past it needn't run again. A `changed`
   * passes none: slot changes (a buddy leaving) don't advance `seq`, so it
   * always syncs.
   */
  onChange: (seq?: number) => void
  /**
   * An authorized HTTP call to the relay (a sync), run before reconnecting
   * after a connection closed before it opened. React Native can't say why a
   * handshake failed, and an access token the relay refused would otherwise be
   * sent again on every reconnect until it expires here; a 401 on this call
   * refreshes it through the session. The connection is tried next whatever it
   * answers, so a sync that fails for another reason never keeps it down.
   */
  verify?: () => Promise<unknown>
  onEvent?: (event: LiveEvent) => void
  now?: () => number
}

/**
 * Keeps one live connection to this User's inbox while started: syncs when the
 * relay says something changed, or on connecting when the inbox moved past what
 * this device has. Reconnects with backoff and detects dead connections with a
 * ping. Pushes and polling still cover the time it's stopped.
 */
export function createLiveInbox(deps: LiveInboxDeps) {
  const now = deps.now ?? Date.now
  const emit = (event: LiveEvent) => deps.onEvent?.(event)
  let running = false
  let socket: LiveSocket | null = null
  let opened = false
  let pingSentAt: number | null = null
  let connecting = false
  /**
   * The last connection closed before it opened (or said anything), as one the
   * relay refused does: `verify` runs before the next.
   */
  let refused = false
  let failures = 0
  let expiredReconnectAt = -Infinity
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

  const scheduleReconnect = () => {
    if (!running || reconnectTimer) return
    const delay =
      RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length - 1)]
    failures += 1
    // Jitter, so a relay restart isn't met by every device at once.
    const inMs = Math.round(delay * (0.8 + Math.random() * 0.4))
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
      // A wiped inbox is restored by the next sync.
      if (event.code === CLOSE_GONE && running) sync()
      // The relay would refuse every reconnect. The sync records the
      // suspension, which keeps this off until a sync works again.
      if (event.code === CLOSE_SUSPENDED) {
        if (running) sync()
        return
      }
      // Backs off as usual if it keeps happening (a clock that's off).
      if (
        event.code === LIVE_CLOSE_EXPIRED &&
        heard &&
        now() - expiredReconnectAt > EXPIRED_RECONNECT_MS
      ) {
        expiredReconnectAt = now()
        connect()
        return
      }
      scheduleReconnect()
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
    /** Replaces the connection now, skipping any backoff. Tools only. */
    reconnect() {
      if (!running) return
      drop()
      failures = 0
      connect()
    },
    /** Sends a keepalive now; the pong's round trip is reported. Tools only. */
    ping() {
      if (socket && opened) sendPing(socket)
    },
  }
}
