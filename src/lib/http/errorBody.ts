/**
 * The service's own error code from a failed response body (`code`, else
 * `error` when it holds a code), for errors that carry the parsed body.
 */
export function errorBodyCode(error: unknown): string | null {
  const body = (error as { body?: unknown } | null)?.body as
    | { code?: unknown; error?: unknown }
    | null
    | undefined
  if (typeof body?.code === 'string') return body.code
  return typeof body?.error === 'string' ? body.error : null
}
