import type { LiveEvent } from '@/features/buddies/lib/liveInbox'

/** Entries kept in the live connection's event log. */
export const LIVE_LOG_LIMIT = 100

export type LiveStatus = 'stopped' | 'connecting' | 'open' | 'reconnecting'

/**
 * What Tools shows about the live connection: where it stands, the latest
 * signals, running counts, and a short event log. Ids and content never enter
 * it, so it can be copied into a bug report as is.
 */
export type LiveDiagnostics = {
  status: LiveStatus
  /** When `status` last changed. */
  since: number | null
  lastHelloSeq: number | null
  lastChangedSeq: number | null
  lastPongRttMs: number | null
  /** When the relay last said anything on this connection (incl. a pong). */
  lastHeardAt: number | null
  lastClose: { code?: number; reason?: string; at: number } | null
  counts: {
    connects: number
    opens: number
    changes: number
    syncs: number
    closes: number
    failures: number
    pongTimeouts: number
  }
  log: { at: number; event: LiveEvent }[]
}

export const initialLiveDiagnostics: LiveDiagnostics = {
  status: 'stopped',
  since: null,
  lastHelloSeq: null,
  lastChangedSeq: null,
  lastPongRttMs: null,
  lastHeardAt: null,
  lastClose: null,
  counts: {
    connects: 0,
    opens: 0,
    changes: 0,
    syncs: 0,
    closes: 0,
    failures: 0,
    pongTimeouts: 0,
  },
  log: [],
}

const STATUS_AFTER: Partial<Record<LiveEvent['type'], LiveStatus>> = {
  connecting: 'connecting',
  open: 'open',
  reconnectScheduled: 'reconnecting',
  stopped: 'stopped',
}

/**
 * A connection that has heard nothing this long has missed a ping's answer
 * (pings go every 25 s and wait 10 s), so it may be dead.
 */
export const LIVE_HEALTHY_MS = 35 * 1000

/**
 * The live connection is open and answering, so it will say when the inbox
 * changes: polling would only repeat it.
 */
export function isLiveHealthy(state: LiveDiagnostics, now: number): boolean {
  return (
    state.status === 'open' &&
    state.lastHeardAt !== null &&
    now - state.lastHeardAt < LIVE_HEALTHY_MS
  )
}

/** Folds one live event into the diagnostics. */
export function applyLiveEvent(
  state: LiveDiagnostics,
  event: LiveEvent,
  at: number
): LiveDiagnostics {
  const status = STATUS_AFTER[event.type] ?? state.status
  const counts = { ...state.counts }
  let next: LiveDiagnostics = {
    ...state,
    status,
    since: status === state.status ? state.since : at,
    counts,
    log: [...state.log, { at, event }].slice(-LIVE_LOG_LIMIT),
  }
  if (
    event.type === 'open' ||
    event.type === 'hello' ||
    event.type === 'changed' ||
    event.type === 'pong'
  )
    next.lastHeardAt = at
  switch (event.type) {
    case 'connecting':
      counts.connects += 1
      break
    case 'open':
      counts.opens += 1
      break
    case 'openFailed':
      counts.failures += 1
      break
    case 'hello':
      next = { ...next, lastHelloSeq: event.seq }
      break
    case 'changed':
      counts.changes += 1
      next = { ...next, lastChangedSeq: event.seq }
      break
    case 'pong':
      next = { ...next, lastPongRttMs: event.rttMs }
      break
    case 'pongTimeout':
      counts.pongTimeouts += 1
      break
    case 'sync':
      counts.syncs += 1
      break
    case 'closed':
      counts.closes += 1
      next = {
        ...next,
        lastClose: { code: event.code, reason: event.reason, at },
      }
      break
  }
  return next
}
