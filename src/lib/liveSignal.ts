export type LiveSocket = {
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: (() => void) | null
  onmessage: ((event: { data?: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: ((event: { code?: number; reason?: string }) => void) | null
}

type HeaderWebSocket = new (
  url: string,
  protocols: null,
  options: { headers: Record<string, string> }
) => LiveSocket

export const openHeaderSocket = (
  url: string,
  headers: Record<string, string>
): LiveSocket =>
  new (WebSocket as unknown as HeaderWebSocket)(url, null, { headers })

const PING_INTERVAL_MS = 25 * 1000

const PONG_TIMEOUT_MS = 10 * 1000

const RECONNECT_DELAYS_MS = [1, 2, 5, 15, 30, 60].map((s) => s * 1000)

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
  } catch {}
  return null
}

export type LiveEvent =
  | { type: 'connecting' }
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

export type LiveCloseAction = 'reconnect' | 'sync' | 'syncAndStay' | 'stay'

export type LiveSignalDeps = {
  open: () => Promise<LiveSocket>

  syncedSeq: () => number

  onChange: (seq?: number) => void

  verify?: () => Promise<unknown>
  onEvent?: (event: LiveEvent) => void

  closeAction?: (code: number | undefined) => LiveCloseAction

  reconnectFloorMs?: (code: number | undefined) => number
  now?: () => number
}

export type LiveSignal = {
  start(): void
  stop(): void

  reconnect(): void

  ping(): void
}

export function createLiveSignal(deps: LiveSignalDeps): LiveSignal {
  const now = deps.now ?? Date.now
  const emit = (event: LiveEvent) => deps.onEvent?.(event)
  let running = false
  let socket: LiveSocket | null = null
  let opened = false
  let pingSentAt: number | null = null
  let connecting = false

  let refused = false
  let failures = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let pongTimer: ReturnType<typeof setTimeout> | null = null
  let changeTimer: ReturnType<typeof setTimeout> | null = null

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

  const discard = (live: LiveSocket) => {
    live.onopen = live.onmessage = () => live.close(1000)
    live.onerror = live.onclose = null
    live.close(1000)
  }

  const attach = (live: LiveSocket) => {
    socket = live
    opened = false
    let heard = false

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
    live.onerror = () => {}
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
