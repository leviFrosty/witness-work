import { HttpError } from '@/lib/http/request'
import type { ScribeSessions } from '@/features/scribe/lib/scribeClient'
import type { StepStreamEvent } from '@/features/scribe/lib/wire'

export type SseItem = StepStreamEvent | string | { wait: number }

export interface SseOptions {
  status?: number

  chunkSize?: number

  crlf?: boolean

  end?: 'close' | 'stall'

  signal?: AbortSignal | null
}

export const HEARTBEAT = ':\n\n'

export const sseFrame = (event: StepStreamEvent, crlf = false): string => {
  const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  return crlf ? frame.replace(/\n/g, '\r\n') : frame
}

const abortError = () =>
  Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })

export function sseResponse(
  items: readonly SseItem[],
  options: SseOptions = {}
): Response {
  const encoder = new TextEncoder()
  const queue = [...items]
  let finish: (() => void) | null = null
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      options.signal?.addEventListener(
        'abort',
        () => {
          finish?.()
          try {
            controller.error(abortError())
          } catch {}
        },
        { once: true }
      )
    },

    async pull(controller) {
      for (;;) {
        const item = queue.shift()
        if (item === undefined) {
          if (options.end === 'stall') {
            await new Promise<void>((resolve) => {
              finish = resolve
            })
            return
          }
          controller.close()
          return
        }
        if (typeof item === 'object' && 'wait' in item) {
          await new Promise((resolve) => setTimeout(resolve, item.wait))
          continue
        }
        const text =
          typeof item === 'string' ? item : sseFrame(item, options.crlf)
        const size = options.chunkSize ?? text.length
        for (let index = 0; index < text.length; index += size)
          controller.enqueue(encoder.encode(text.slice(index, index + size)))
        return
      }
    },
  })
  return new Response(body, {
    status: options.status ?? 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  })
}

export const jsonResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

export const envelope = (
  code: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({ ok: false, error: code, code, ...extra })

export interface RecordedRequest {
  url: string
  method: string

  headers: Record<string, string>

  body: unknown
  signal: AbortSignal | null
}

export type Responder =
  | Response
  | Error
  | ((request: RecordedRequest) => Response | Promise<Response>)

export type FakeFetch = typeof fetch & {
  calls: RecordedRequest[]
}

const headersOf = (init: RequestInit | undefined): Record<string, string> => {
  const headers: Record<string, string> = {}
  new Headers(init?.headers).forEach((value, name) => {
    headers[name] = value
  })
  return headers
}

const bodyOf = (init: RequestInit | undefined): unknown => {
  if (typeof init?.body !== 'string') return null
  try {
    return JSON.parse(init.body)
  } catch {
    return init.body
  }
}

export function fakeFetch(...responders: Responder[]): FakeFetch {
  const calls: RecordedRequest[] = []
  const handler = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const request: RecordedRequest = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: headersOf(init),
      body: bodyOf(init),
      signal: init?.signal ?? null,
    }
    calls.push(request)
    if (request.signal?.aborted) throw abortError()
    const responder =
      responders[Math.min(calls.length - 1, responders.length - 1)]
    if (!responder) throw new Error('fakeFetch: no responder')
    if (responder instanceof Error) throw responder
    if (responder instanceof Response) return responder
    return responder(request)
  }
  return Object.assign(handler as typeof fetch, { calls })
}

export interface FakeSessions extends ScribeSessions {
  authorizations: string[]

  refreshes: number
}

export function fakeSessions(
  options: { tokens?: string[]; fail?: unknown } = {}
): FakeSessions {
  const tokens = options.tokens ?? ['token-1', 'token-2']
  let current = 0
  const sessions: FakeSessions = {
    authorizations: [],
    refreshes: 0,
    async withSession<T>(run: (authorization: string) => Promise<T>) {
      if (options.fail !== undefined) throw options.fail
      const attempt = () => {
        const authorization = `Bearer ${tokens[Math.min(current, tokens.length - 1)]}`
        sessions.authorizations.push(authorization)
        return run(authorization)
      }
      try {
        return await attempt()
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 401) throw error
        sessions.refreshes++
        current++
        return attempt()
      }
    },
  }
  return sessions
}
