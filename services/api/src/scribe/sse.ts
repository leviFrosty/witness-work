import type { ScribeSseEvent } from './wire'

/**
 * Scribe AI's SSE framing (protocol: Response: SSE): `event: <type>` and a
 * `data:` line whose JSON repeats `type`, no `id:` lines, and a `:` comment
 * every 15 s while the model works. The writer notices a gone client (a
 * write that fails) and reports it once through `onClosed`, so the step can
 * abort the model call.
 */

export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
} as const

export const HEARTBEAT_MS = 15_000

const encoder = new TextEncoder()

export const sseFrame = (event: ScribeSseEvent): string =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`

export const SSE_HEARTBEAT = ':\n\n'

export interface SseWriter {
  readable: ReadableStream<Uint8Array>
  /** Queues one event. Resolves false once the client is gone. */
  send(event: ScribeSseEvent): Promise<boolean>
  /** Starts the 15 s heartbeat (idempotent). */
  startHeartbeat(): void
  /** Stops the heartbeat and closes the stream. */
  close(): Promise<void>
  /** True once a write failed (the client went away). */
  readonly closed: boolean
}

export const createSseWriter = (
  options: {
    onClosed?: () => void
    heartbeatMs?: number
    setInterval?: typeof globalThis.setInterval
    clearInterval?: typeof globalThis.clearInterval
  } = {}
): SseWriter => {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const every = options.setInterval ?? globalThis.setInterval
  const stop = options.clearInterval ?? globalThis.clearInterval
  let closed = false
  let ended = false
  let heartbeat: ReturnType<typeof setInterval> | null = null
  // Writes run one after another, in order.
  let queue: Promise<unknown> = Promise.resolve()

  const markClosed = () => {
    if (closed) return
    closed = true
    if (heartbeat) stop(heartbeat)
    heartbeat = null
    options.onClosed?.()
  }

  const write = (text: string): Promise<boolean> => {
    if (closed || ended) return Promise.resolve(false)
    const next = queue.then(async () => {
      if (closed) return false
      try {
        await writer.write(encoder.encode(text))
        return true
      } catch {
        markClosed()
        return false
      }
    })
    queue = next
    return next
  }

  return {
    readable,
    send: (event) => write(sseFrame(event)),
    startHeartbeat() {
      if (heartbeat || closed || ended) return
      heartbeat = every(() => {
        void write(SSE_HEARTBEAT)
      }, options.heartbeatMs ?? HEARTBEAT_MS)
    },
    async close() {
      if (heartbeat) stop(heartbeat)
      heartbeat = null
      if (ended) return
      await queue
      ended = true
      if (closed) return
      await writer.close().catch(() => undefined)
    },
    get closed() {
      return closed
    },
  }
}
