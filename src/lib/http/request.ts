import { perf } from '@/lib/perf'
import { isKnownOffline } from '@/lib/http/online'
import {
  classifyNetworkError,
  kindForStatus,
  type NetworkErrorKind,
} from '@/lib/http/networkError'

export class HttpError extends Error {
  constructor(
    readonly kind: NetworkErrorKind,
    readonly status: number | null = null,
    readonly serverCode: string | null = null,
    readonly retryAfterMs: number | null = null,
    message?: string,
    readonly body: unknown = null
  ) {
    super(message ?? (serverCode ? `${kind}: ${serverCode}` : kind))
    this.name = 'HttpError'
  }
}

export type RetryPolicy = {
  retries: number

  baseDelayMs?: number

  maxDelayMs?: number
}

export type RequestOptions = {
  url: string
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>

  json?: unknown

  body?: string | Uint8Array

  timeoutMs: number
  signal?: AbortSignal

  retry?: RetryPolicy
  idempotent?: boolean

  responseType?: 'json' | 'text' | 'none' | 'bytes'

  fetchImpl?: typeof fetch

  ignoreOfflineState?: boolean
}

export type HttpResponse<T> = {
  status: number
  headers: Headers
  data: T
}

const DEFAULT_BASE_DELAY_MS = 500
const DEFAULT_MAX_DELAY_MS = 30_000

export async function request<T = unknown>(
  options: RequestOptions
): Promise<HttpResponse<T>> {
  const method = options.method ?? (options.json === undefined ? 'GET' : 'POST')
  const idempotent =
    options.idempotent ?? (method === 'GET' || method === 'HEAD')
  const retries = idempotent ? (options.retry?.retries ?? 0) : 0
  for (let attempt = 0; ; attempt++) {
    try {
      return await attemptRequest<T>(options, method)
    } catch (error) {
      const failure = toHttpError(error)
      const retryable =
        failure.kind === 'offline' ||
        failure.kind === 'timeout' ||
        failure.kind === 'rateLimited' ||
        (failure.kind === 'server' && failure.status !== 501)
      if (attempt >= retries || !retryable || options.signal?.aborted)
        throw failure
      await sleep(retryDelay(attempt, failure, options.retry), options.signal)
    }
  }
}

async function attemptRequest<T>(
  options: RequestOptions,
  method: string
): Promise<HttpResponse<T>> {
  if (options.signal?.aborted) throw new HttpError('cancelled')
  if (!options.ignoreOfflineState && isKnownOffline())
    throw new HttpError('offline')

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs)
  const onCallerAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onCallerAbort)

  const headers: Record<string, string> = { ...options.headers }
  let body = options.body
  if (options.json !== undefined) {
    headers['content-type'] ??= 'application/json'
    body = JSON.stringify(options.json)
  }

  try {
    perf.count('http:request')
    const response = await (options.fetchImpl ?? fetch)(options.url, {
      method,
      headers,

      body: body as BodyInit | undefined,
      signal: controller.signal,
    })
    if (response.ok && options.responseType === 'bytes') {
      return {
        status: response.status,
        headers: response.headers,
        data: new Uint8Array(await response.arrayBuffer()) as T,
      }
    }
    const text =
      options.responseType === 'none' && response.ok
        ? ''
        : await response.text()
    if (!response.ok) {
      const errorBody = jsonOrNull(text)
      throw new HttpError(
        kindForStatus(response.status),
        response.status,
        serverCodeFrom(errorBody),
        retryAfterMs(response.headers.get('retry-after')),
        undefined,
        errorBody
      )
    }
    let data: unknown = text
    if ((options.responseType ?? 'json') === 'json') {
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        if (isHtml(response.headers, text))
          throw new HttpError(
            'offline',
            response.status,
            null,
            null,
            'offline: HTML page instead of JSON'
          )
        throw new HttpError(
          'unknown',
          response.status,
          null,
          null,
          'invalid JSON'
        )
      }
    }
    return {
      status: response.status,
      headers: response.headers,
      data: data as T,
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (timedOut) throw new HttpError('timeout')
    if (options.signal?.aborted) throw new HttpError('cancelled')
    throw toHttpError(error)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onCallerAbort)
  }
}

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error
  const kind = classifyNetworkError(error)

  return new HttpError(
    kind === 'unknown' ? 'offline' : kind,
    null,
    null,
    null,
    error instanceof Error ? error.message : undefined
  )
}

function isHtml(headers: Headers, text: string): boolean {
  return (
    (headers.get('content-type') ?? '').toLowerCase().includes('html') ||
    text.trimStart().startsWith('<')
  )
}

function jsonOrNull(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function serverCodeFrom(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null

  const parsed = body as { error?: unknown; code?: unknown }
  if (typeof parsed.code === 'string') return parsed.code
  return typeof parsed.error === 'string' ? parsed.error : null
}

export function retryAfterMs(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

function retryDelay(
  attempt: number,
  failure: HttpError,
  policy: RetryPolicy | undefined
): number {
  const max = policy?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  if (failure.retryAfterMs !== null) return Math.min(failure.retryAfterMs, max)
  const ceiling = Math.min(
    max,
    (policy?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS) * 2 ** attempt
  )
  return Math.random() * ceiling
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new HttpError('cancelled'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new HttpError('cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
