import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import {
  createTransport,
  wrapRequestHandler,
  type CloudflareOptions,
} from '@sentry/cloudflare'
import { Sentry, createSentryConfig } from './sentry'
import type { Environment } from './types'

/**
 * A legacy Notes Import run request through the SDK's own request wrapper
 * (as `Sentry.withSentry` runs every request), with the worker's config and a
 * transport that keeps every envelope: the error, the transaction (Notes
 * Import traces at 100%), a child span, and a breadcrumb, all as Sentry
 * would receive them. Its own file, since the SDK's `init` sets global state.
 */

const SECRET = 'legacy-subscribe-token-0123456789abcdef'
const IMPORT_ID = `imp_${'a'.repeat(40)}`
const URL_WITH_TOKEN = `https://ww-proxy.test/notes-import/${IMPORT_ID}/events?token=${SECRET}&lastEventId=3`
const UPSTREAM = `https://upstream.test/echo?token=${SECRET}`
const REDACTED_UPSTREAM = 'https://upstream.test/echo?token=[redacted]'

interface Sent {
  /** Every envelope the transport got, joined. */
  sent: string
  error: Record<string, unknown>
  transaction: Record<string, unknown>
  /** What the route read as its `token` query parameter. */
  token: string | undefined
}

/**
 * Runs one request to the legacy events route through `wrapRequestHandler`.
 * The route adds the breadcrumb and span the fetch integration records for
 * an outbound call to `upstream`, then captures an error.
 */
async function sendThroughSdk(url: string, upstream: string): Promise<Sent> {
  const envelopes: string[] = []
  const options: CloudflareOptions = {
    ...createSentryConfig({
      SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
      APP_ATTEST_ENVIRONMENT: 'production',
    } as Environment),
    transport: (transportOptions) =>
      createTransport(transportOptions, async ({ body }) => {
        envelopes.push(
          typeof body === 'string' ? body : new TextDecoder().decode(body)
        )
        return {}
      }),
  }
  let token: string | undefined
  const app = new Hono().get('/notes-import/:importId/events', async (c) => {
    token = c.req.query('token')
    Sentry.addBreadcrumb({
      type: 'http',
      category: 'fetch',
      data: { method: 'GET', url: upstream, status_code: 200 },
    })
    await Sentry.startSpan(
      {
        name: `GET ${upstream}`,
        op: 'http.client',
        attributes: { 'url.full': upstream },
      },
      async () => undefined
    )
    Sentry.captureException(new Error('stream failed'))
    return c.text('ok')
  })
  const request = new Request(url, {
    headers: { referer: url, accept: 'text/event-stream' },
  })
  const flushes: Promise<unknown>[] = []

  const response = await wrapRequestHandler(
    {
      options,
      request: request as never,
      context: {
        waitUntil: (promise: Promise<unknown>) => flushes.push(promise),
      } as unknown as ExecutionContext,
    },
    () => app.fetch(request)
  )
  expect(response.status).toBe(200)
  await Promise.all(flushes)
  await Sentry.flush(2_000)

  // Each envelope is a header line, then an item header and payload per
  // item; only payloads carry an `event_id`.
  const items = envelopes.flatMap((envelope) =>
    envelope
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((item) => 'event_id' in item && 'timestamp' in item)
  )
  const error = items.find(
    (item) =>
      (item.exception as { values?: { value?: string }[] } | undefined)
        ?.values?.[0]?.value === 'stream failed'
  )
  const transaction = items.find((item) => item.type === 'transaction')
  expect(error).toBeDefined()
  expect(transaction).toBeDefined()
  return {
    sent: envelopes.join('\n'),
    error: error!,
    transaction: transaction!,
    token,
  }
}

const traceData = (transaction: Record<string, unknown>) =>
  (transaction.contexts as { trace: { data: Record<string, unknown> } }).trace
    .data

describe('Sentry on a request with a subscribe token in its URL', () => {
  it('sends the error and the transaction without the token', async () => {
    const { sent, error, transaction, token } = await sendThroughSdk(
      URL_WITH_TOKEN,
      UPSTREAM
    )
    expect(token).toBe(SECRET)

    expect(sent).not.toContain(SECRET)
    // The rest of the URL survives, so the trace is still useful.
    const redacted = `https://ww-proxy.test/notes-import/${IMPORT_ID}/events?token=[redacted]&lastEventId=3`
    expect(error.request).toMatchObject({
      url: redacted,
      query_string: 'token=[redacted]&lastEventId=3',
      headers: { referer: redacted },
    })
    expect(transaction.transaction).toBe(
      `GET /notes-import/${IMPORT_ID}/events`
    )
    expect(traceData(transaction)['url.full']).toBe(redacted)
    expect(error.breadcrumbs).toEqual([
      expect.objectContaining({
        data: { method: 'GET', url: REDACTED_UPSTREAM, status_code: 200 },
      }),
    ])
    expect(transaction.spans).toEqual([
      expect.objectContaining({
        description: `GET ${REDACTED_UPSTREAM}`,
        data: expect.objectContaining({ 'url.full': REDACTED_UPSTREAM }),
      }),
    ])
  })

  it('sends neither without the token when its name is percent-encoded', async () => {
    // Hono decodes the name, so the route reads `to%6Ben` as `token`.
    const url = `https://ww-proxy.test/notes-import/${IMPORT_ID}/events?lastEventId=3&to%6Ben=${SECRET}`
    const upstream = `https://upstream.test/echo?%74oken=${SECRET}&api%4Bey=${SECRET}`
    const { sent, error, transaction, token } = await sendThroughSdk(
      url,
      upstream
    )
    expect(token).toBe(SECRET)

    expect(sent).not.toContain(SECRET)
    const redacted = `https://ww-proxy.test/notes-import/${IMPORT_ID}/events?lastEventId=3&to%6Ben=[redacted]`
    const redactedUpstream =
      'https://upstream.test/echo?%74oken=[redacted]&api%4Bey=[redacted]'
    expect(error.request).toMatchObject({
      url: redacted,
      query_string: 'lastEventId=3&to%6Ben=[redacted]',
      headers: { referer: redacted },
    })
    expect(traceData(transaction)).toMatchObject({
      'url.full': redacted,
    })
    // The SDK keeps the previous test's breadcrumb as well.
    expect(error.breadcrumbs).toContainEqual(
      expect.objectContaining({
        data: { method: 'GET', url: redactedUpstream, status_code: 200 },
      })
    )
    expect(transaction.spans).toEqual([
      expect.objectContaining({
        description: `GET ${redactedUpstream}`,
        data: expect.objectContaining({ 'url.full': redactedUpstream }),
      }),
    ])
  })
})
