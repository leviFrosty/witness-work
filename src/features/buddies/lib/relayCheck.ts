import { isRelayError, type LiveSocket } from '@/features/buddies/lib/relay'

/** How long each step may take before it counts as failed. */
const STEP_TIMEOUT_MS = 8 * 1000

export type RelayCheckStepName = 'health' | 'inbox' | 'liveHello' | 'livePing'

export type RelayCheckStep = {
  name: RelayCheckStepName
  ok: boolean
  /** Not run because an earlier step it needs failed. */
  skipped?: boolean
  ms: number
  detail: string
}

export type RelayCheckReport = {
  baseUrl: string
  at: string
  ok: boolean
  steps: RelayCheckStep[]
}

export type InboxProbe = {
  since: number
  seq: number
  slots: number
  cards: number
  events: number
  rosterChanged: boolean
}

export type RelayCheckDeps = {
  baseUrl: string
  fetchImpl?: typeof fetch
  probeInbox: () => Promise<InboxProbe>
  /** Opens a separate live socket; the running connection is untouched. */
  openLive: () => Promise<LiveSocket>
  now?: () => number
  timeoutMs?: number
}

const describeError = (error: unknown): string => {
  if (isRelayError(error))
    return `relay ${error.code}${error.status ? ` (HTTP ${error.status})` : ''}`
  return error instanceof Error ? error.message : String(error)
}

/** Waits for the socket to say something that `accept` takes. */
function waitFor<T>(
  socket: LiveSocket,
  accept: (data: unknown) => T | undefined,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no answer within ${timeoutMs} ms`)),
      timeoutMs
    )
    const done = (settle: () => void) => {
      clearTimeout(timer)
      socket.onmessage = null
      socket.onclose = null
      socket.onerror = null
      settle()
    }
    socket.onmessage = (event) => {
      const value = accept(event.data)
      if (value !== undefined) done(() => resolve(value))
    }
    socket.onclose = (event) =>
      done(() =>
        reject(
          new Error(
            `closed${event.code ? ` ${event.code}` : ''}${event.reason ? ` ${event.reason}` : ''}`
          )
        )
      )
    socket.onerror = (event) => {
      const message =
        typeof event === 'object' && event !== null && 'message' in event
          ? String(event.message)
          : 'socket error'
      done(() => reject(new Error(message)))
    }
  })
}

const helloSeq = (data: unknown): number | undefined => {
  if (typeof data !== 'string') return undefined
  try {
    const message = JSON.parse(data) as { type?: string; seq?: unknown }
    return message.type === 'hello' && typeof message.seq === 'number'
      ? message.seq
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Checks each hop between this device and the Buddies relay: the Worker is up,
 * it accepts this device's signed inbox read, and a live socket opens, greets,
 * and answers a ping. Read-only, and it never touches the running live
 * connection. For Tools and the verify harness.
 */
export async function runRelayCheck(
  deps: RelayCheckDeps
): Promise<RelayCheckReport> {
  const now = deps.now ?? Date.now
  const fetchImpl = deps.fetchImpl ?? fetch
  const timeoutMs = deps.timeoutMs ?? STEP_TIMEOUT_MS
  const steps: RelayCheckStep[] = []
  const at = new Date(now()).toISOString()

  const step = async (
    name: RelayCheckStepName,
    run: () => Promise<string>
  ): Promise<boolean> => {
    const started = now()
    try {
      const detail = await run()
      steps.push({ name, ok: true, ms: now() - started, detail })
      return true
    } catch (error) {
      steps.push({
        name,
        ok: false,
        ms: now() - started,
        detail: describeError(error),
      })
      return false
    }
  }
  const skip = (name: RelayCheckStepName, detail: string) =>
    steps.push({ name, ok: false, skipped: true, ms: 0, detail })

  await step('health', async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${deps.baseUrl}/health`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return `HTTP ${response.status}`
    } finally {
      clearTimeout(timer)
    }
  })

  await step('inbox', async () => {
    const probe = await deps.probeInbox()
    return `seq ${probe.seq} (synced to ${probe.since}) · ${probe.slots} slots · ${probe.events} new events · ${probe.cards} new cards`
  })

  const held: { socket: LiveSocket | null } = { socket: null }
  const opened = await step('liveHello', async () => {
    held.socket = await deps.openLive()
    const seq = await waitFor(held.socket, helloSeq, timeoutMs)
    return `hello seq ${seq}`
  })
  const live = held.socket
  if (opened && live) {
    await step('livePing', async () => {
      const started = now()
      live.send('ping')
      await waitFor(
        live,
        (data) => (data === 'pong' ? true : undefined),
        timeoutMs
      )
      return `pong in ${now() - started} ms`
    })
  } else {
    skip('livePing', 'needs an open live socket')
  }
  live?.close(1000)

  return { baseUrl: deps.baseUrl, at, ok: steps.every((s) => s.ok), steps }
}
