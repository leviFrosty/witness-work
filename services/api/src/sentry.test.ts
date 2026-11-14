import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type {
  Breadcrumb,
  CloudflareOptions,
  ErrorEvent,
} from '@sentry/cloudflare'
import { DrizzleQueryError } from 'drizzle-orm'
import {
  DatabaseError,
  Sentry,
  captureFailure,
  captureOperationFailure,
  createSentryConfig,
  isDatabaseError,
  redactContactLinkPayloads,
  redactDatabaseErrors,
  redactSecretQueryParameters,
  reportableError,
} from './sentry'
import { recordSentryEvents, type SentryRecorder } from './test/sentry'
import type { Environment } from './types'

type TransactionEvent = Parameters<
  NonNullable<CloudflareOptions['beforeSendTransaction']>
>[0]

// gzip + base64url contact JSON, exactly as the app encodes it.
const PAYLOAD =
  'H4sIAAAAAAAAE42MMQvCMBQG_0r4VpPyUohgNsHJ2ckttA8MYl5IglVK_7tEcBduvLsVTy41SoKHHQga7Z0ZHktsiWtdpNzNJKmFqUGDX1lK4_nY4DHSuDd0MGQvRP7LQERXaPwKvyLO8JgsNFJ49PM5JFYn4a4VDn_c8k1SL3dWOecUWSJs2wdjV8GKuwAAAA'
const LINK = `https://ww-proxy.leviwilkerson.com/c/${PAYLOAD}`
const REDACTED_LINK = 'https://ww-proxy.leviwilkerson.com/c/[redacted]'

const config = createSentryConfig({
  SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
} as Environment)

describe('createSentryConfig', () => {
  it('does not send default PII', () => {
    expect(config.sendDefaultPii).toBe(false)
  })
})

describe('redactContactLinkPayloads', () => {
  it.each([
    [LINK, REDACTED_LINK],
    [`${LINK}?utm_source=share`, `${REDACTED_LINK}?utm_source=share`],
    [`GET /c/${PAYLOAD}`, 'GET /c/[redacted]'],
    [`/c/${PAYLOAD}/more`, '/c/[redacted]'],
    [`Bad link "${LINK}"`, `Bad link "${REDACTED_LINK}"`],
  ])('redacts %s', (input, expected) => {
    expect(redactContactLinkPayloads(input)).toBe(expected)
  })

  it.each([
    'https://ww-proxy.leviwilkerson.com/c',
    'GET /c/:payload',
    'GET /notes-import/:importId/events',
    'https://geocode.search.hereapi.com/v1/geocode?q=1',
  ])('leaves %s alone', (input) => {
    expect(redactContactLinkPayloads(input)).toBe(input)
  })
})

describe('redactSecretQueryParameters', () => {
  const EVENTS = 'https://ww-proxy.test/notes-import/imp_0123/events'
  it.each([
    [`${EVENTS}?token=s3cr3t`, `${EVENTS}?token=[redacted]`],
    [
      `${EVENTS}?lastEventId=3&token=s3cr3t&x=1`,
      `${EVENTS}?lastEventId=3&token=[redacted]&x=1`,
    ],
    [`${EVENTS}?token=s3cr3t#top`, `${EVENTS}?token=[redacted]#top`],
    [`${EVENTS}?TOKEN=s3cr3t`, `${EVENTS}?TOKEN=[redacted]`],
    [`GET ${EVENTS}?token=s3cr3t 200`, `GET ${EVENTS}?token=[redacted] 200`],
    [`"${EVENTS}?token=s3cr3t"`, `"${EVENTS}?token=[redacted]"`],
    // The SDK's `query_string` and `url.query` drop the `?`.
    ['token=s3cr3t&lastEventId=3', 'token=[redacted]&lastEventId=3'],
    [
      'https://ww-proxy.test/autocomplete?q=Main%20St&apiKey=k3y',
      'https://ww-proxy.test/autocomplete?q=[redacted]&apiKey=[redacted]',
    ],
    // The HERE proxy's search text and the user's location.
    [
      'https://ww-proxy.test/autocomplete?q=12+Oak+Rd&limit=5&in=circle%3A35.3%2C-79.1%3Br%3D1000000',
      'https://ww-proxy.test/autocomplete?q=[redacted]&limit=5&in=[redacted]',
    ],
    [
      'https://ww-proxy.test/geocode?q=12%20Oak%20Rd%20Springfield&limit=1',
      'https://ww-proxy.test/geocode?q=[redacted]&limit=1',
    ],
    [
      '?qq=city%3DSpringfield&at=35.3,-79.1&lang=en',
      '?qq=[redacted]&at=[redacted]&lang=en',
    ],
    ['Q=12+Oak+Rd&limit=5', 'Q=[redacted]&limit=5'],
    // Hono and URLSearchParams decode names, so these are `token` too. The
    // raw name stays.
    [`${EVENTS}?to%6ben=s3cr3t`, `${EVENTS}?to%6ben=[redacted]`],
    [
      `${EVENTS}?lastEventId=3&%74%6F%6B%65%6E=s3cr3t#top`,
      `${EVENTS}?lastEventId=3&%74%6F%6B%65%6E=[redacted]#top`,
    ],
    ['TO%4Ben=s3cr3t&lastEventId=3', 'TO%4Ben=[redacted]&lastEventId=3'],
    ['?to%6ben=s3cr3t', '?to%6ben=[redacted]'],
    [
      'https://ww-proxy.test/autocomplete?q=Main&api%4Bey=k3y',
      'https://ww-proxy.test/autocomplete?q=[redacted]&api%4Bey=[redacted]',
    ],
    // A secret's value runs to the next `&`, whatever it holds.
    [`${EVENTS}?token=s3c?r3t=x&a=1`, `${EVENTS}?token=[redacted]&a=1`],
    [`${EVENTS}?token=s3c%26r3t&a=1`, `${EVENTS}?token=[redacted]&a=1`],
    [`${EVENTS}?token=&a=1`, `${EVENTS}?token=[redacted]&a=1`],
    // A parameter inside another one's value, as in a nested URL.
    [
      `${EVENTS}?next=/x?to%6ben=s3cr3t&a=1`,
      `${EVENTS}?next=/x?to%6ben=[redacted]&a=1`,
    ],
    [`${EVENTS}??token=s3cr3t`, `${EVENTS}??token=[redacted]`],
    // Every secret in a string, not only the first.
    [
      `${EVENTS}?token=a&to%6ben=b and ${EVENTS}?apikey=c`,
      `${EVENTS}?token=[redacted]&to%6ben=[redacted] and ${EVENTS}?apikey=[redacted]`,
    ],
  ])('redacts %s', (input, expected) => {
    expect(redactSecretQueryParameters(input)).toBe(expected)
  })

  it.each([
    `${EVENTS}?lastEventId=3`,
    'GET /notes-import/:importId/events',
    'https://ww-proxy.test/autocomplete?lang=token',
    'https://ww-proxy.test/geocode?limit=a%3Dtoken%3D1',
    'a token=s3cr3t in prose',
    // Names that decode to something else, malformed escapes included.
    `${EVENTS}?to%6ben%=x&tok%ZZen=x&to%256ben=x&tokens=x&to+ken=x`,
    `${EVENTS}?%E0token=x&token%00=x&mytoken=x&api_key=x`,
  ])('leaves %s alone', (input) => {
    expect(redactSecretQueryParameters(input)).toBe(input)
  })

  // Whatever spelling of a name the worker reads as `token` (Hono, on the
  // legacy run routes) or `apiKey` (URLSearchParams, in the HERE proxy), the
  // scrubbed URL keeps none of its value.
  const app = new Hono().get('*', (c) =>
    c.json({ token: c.req.query('token') ?? null })
  )
  /** `decodeURIComponent` with `+` as a space, or the name if malformed. */
  const decodeName = (name: string): string => {
    try {
      return decodeURIComponent(name.replace(/\+/g, ' '))
    } catch {
      return name
    }
  }
  it.each([
    'token',
    'to%6ben',
    'to%6Ben',
    '%74oken',
    '%74%6f%6b%65%6e',
    'TOKEN',
    'To%4Ben',
    'apiKey',
    'api%4Bey',
    '%61%70%69%4b%65%79',
    'APIKEY',
    'to%6ben%',
    'tok%ZZen',
    'to%256ben',
    'to+ken',
    '%E0token',
  ])('cuts the value of %s whenever the worker reads it', async (name) => {
    const SECRET = 'value-the-worker-reads-0123'
    const decoded = decodeName(name)
    for (const query of [
      `${name}=${SECRET}`,
      `lastEventId=3&${name}=${SECRET}&x=%20`,
      `${name}=${SECRET}&q=a+b`,
    ]) {
      const url = `${EVENTS}?${query}`
      const { token } = (await (await app.request(url)).json()) as {
        token: string | null
      }
      const read = [token, new URL(url).searchParams.get('apiKey')]
      const scrubbed = redactSecretQueryParameters(url)
      expect(read.includes(SECRET)).toBe(
        decoded === 'token' || decoded === 'apiKey'
      )
      // Cut whenever the name decodes to a secret one, in any case.
      expect(scrubbed.includes(SECRET)).toBe(
        !/^(token|apikey)$/i.test(decoded)
      )
    }
  })
})

describe('Sentry scrubbers', () => {
  it('beforeSend scrubs URLs, request data and messages', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: `Failed to render ${LINK}`,
      request: {
        url: LINK,
        method: 'GET',
        headers: { referer: LINK, 'user-agent': 'Slackbot-LinkExpanding' },
      },
      exception: { values: [{ type: 'Error', value: `Bad link ${LINK}` }] },
      breadcrumbs: [{ category: 'fetch', data: { url: LINK } }],
      contexts: {
        trace: { trace_id: 't', span_id: 's', data: { 'url.full': LINK } },
      },
    }

    const scrubbed = config.beforeSend!(event, {}) as ErrorEvent

    expect(JSON.stringify(scrubbed)).not.toContain(PAYLOAD)
    expect(scrubbed.request?.url).toBe(REDACTED_LINK)
    expect(scrubbed.request?.headers).toEqual({
      referer: REDACTED_LINK,
      'user-agent': 'Slackbot-LinkExpanding',
    })
    expect(scrubbed.exception?.values?.[0].value).toBe(
      `Bad link ${REDACTED_LINK}`
    )
  })

  it('beforeSendTransaction scrubs transaction names, spans and request data', () => {
    const event: TransactionEvent = {
      type: 'transaction',
      transaction: `GET /c/${PAYLOAD}`,
      request: { url: LINK },
      contexts: {
        trace: { trace_id: 't', span_id: 's', data: { 'url.full': LINK } },
      },
      spans: [
        {
          span_id: 'c',
          trace_id: 't',
          start_timestamp: 0,
          description: `GET ${LINK}`,
          data: { 'url.full': LINK },
        },
      ],
    }

    const scrubbed = config.beforeSendTransaction!(
      event,
      {}
    ) as TransactionEvent

    expect(JSON.stringify(scrubbed)).not.toContain(PAYLOAD)
    expect(scrubbed.transaction).toBe('GET /c/[redacted]')
    expect(scrubbed.contexts?.trace?.data?.['url.full']).toBe(REDACTED_LINK)
  })

  it('beforeBreadcrumb scrubs breadcrumb URLs and messages', () => {
    const breadcrumb: Breadcrumb = {
      category: 'fetch',
      message: `GET ${LINK}`,
      data: { url: LINK, status_code: 200 },
    }

    expect(config.beforeBreadcrumb!(breadcrumb)).toEqual({
      category: 'fetch',
      message: `GET ${REDACTED_LINK}`,
      data: { url: REDACTED_LINK, status_code: 200 },
    })
  })

  it('drops the Buddies live-socket auth headers from events and transactions', () => {
    const headers = () => ({
      'x-buddies-payload': 'eyJpbmJveElkIjoiQUFBQUFBQUFBQUFBQUFBQUFBQUFBQSJ9',
      'X-Buddies-Signature': 'c2lnbmF0dXJl',
      'x-buddies-p': 'eyJpbmJveElkIjoiQUFBQUFBQUFBQUFBQUFBQUFBQUFBQSJ9',
      'X-Buddies-S': 'c2lnbmF0dXJl',
      upgrade: 'websocket',
    })
    const error: ErrorEvent = {
      type: undefined,
      request: { url: 'https://ww-proxy.test/buddies/v1/inbox/live', headers: headers() },
    }
    const transaction: TransactionEvent = {
      type: 'transaction',
      request: { url: 'https://ww-proxy.test/buddies/v1/inbox/live', headers: headers() },
    }

    expect((config.beforeSend!(error, {}) as ErrorEvent).request?.headers).toEqual({
      upgrade: 'websocket',
    })
    expect(
      (config.beforeSendTransaction!(transaction, {}) as TransactionEvent).request?.headers
    ).toEqual({ upgrade: 'websocket' })
  })

  it('drops the account backup envelope headers, and only those', () => {
    const error: ErrorEvent = {
      type: undefined,
      request: {
        url: 'https://ww-proxy.test/accounts/v1/backup/put',
        headers: {
          'x-ww-payload': 'eyJhY2NvdW50UHViIjoiQUFBQSJ9',
          'X-WW-Signature': 'c2lnbmF0dXJl',
          'x-ww-p': 'eyJhY2NvdW50UHViIjoiQUFBQSJ9',
          'X-WW-S': 'c2lnbmF0dXJl',
          'x-ww-sha256': 'kept',
          'content-type': 'application/octet-stream',
        },
      },
    }
    expect((config.beforeSend!(error, {}) as ErrorEvent).request?.headers).toEqual({
      'x-ww-sha256': 'kept',
      'content-type': 'application/octet-stream',
    })
  })

  it('drops the bearer backup upload’s slot id', () => {
    const error: ErrorEvent = {
      type: undefined,
      request: {
        url: 'https://ww-proxy.test/accounts/v1/backup/put',
        headers: {
          Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.c2ln',
          'X-WW-Slot-Id': 'AAAAAAAAAAAAAAAAAAAAAA',
          'x-ww-sha256': 'kept',
          'content-length': '42',
        },
      },
    }
    expect((config.beforeSend!(error, {}) as ErrorEvent).request?.headers).toEqual({
      'x-ww-sha256': 'kept',
      'content-length': '42',
    })
  })

  it('drops the Shared Spaces live socket’s member and token headers from events and transactions', () => {
    const headers = () => ({
      'X-WW-Space-Auth': 'eyJzcGFjZUlkIjoiQUFBQSJ9',
      'X-WW-Space-Token': 'c2VjcmV0LXRva2VuLWJ5dGVzLXRoYXQtYXJlLTMyLWxvbmc',
      'X-WW-Space-Member-Token': '{"spaceId":"AAAA","tokenHash":"BBBB"}',
      'x-ww-spaces': 'kept',
      'x-ww-space-authority': 'kept',
      upgrade: 'websocket',
    })
    const kept = {
      'x-ww-spaces': 'kept',
      'x-ww-space-authority': 'kept',
      upgrade: 'websocket',
    }
    const url = 'https://ww-proxy.test/spaces/v1/live'
    const error: ErrorEvent = { type: undefined, request: { url, headers: headers() } }
    const transaction: TransactionEvent = {
      type: 'transaction',
      request: { url, headers: headers() },
    }
    expect((config.beforeSend!(error, {}) as ErrorEvent).request?.headers).toEqual(kept)
    expect(
      (config.beforeSendTransaction!(transaction, {}) as TransactionEvent).request?.headers
    ).toEqual(kept)
  })

  it('drops a browser live socket’s offer, which holds its ticket', () => {
    const error: ErrorEvent = {
      type: undefined,
      request: {
        url: 'https://ww-proxy.test/accounts/v1/sync/live',
        headers: {
          'Sec-WebSocket-Protocol': 'ww.v1, ticket.eyJ0eXAiOiJ3dy1saXZlIn0.c2ln',
          'x-ww-sync-expires-at': '1792412100000',
          origin: 'http://localhost:8081',
        },
      },
    }
    expect((config.beforeSend!(error, {}) as ErrorEvent).request?.headers).toEqual({
      'x-ww-sync-expires-at': '1792412100000',
      origin: 'http://localhost:8081',
    })
  })

  it('drops request bodies (passkey responses, tickets, challenge tokens)', () => {
    const body = JSON.stringify({ challengeToken: 'challenge-secret', response: { id: 'cred' }, ticket: 'ticket-secret' })
    const error: ErrorEvent = {
      type: undefined,
      request: { url: 'https://ww-proxy.test/accounts/v1/passkeys/assert', method: 'POST', data: body },
    }
    const transaction: TransactionEvent = {
      type: 'transaction',
      request: { url: 'https://ww-proxy.test/accounts/v1/sessions', data: body },
    }
    const scrubbedError = config.beforeSend!(error, {}) as ErrorEvent
    const scrubbedTransaction = config.beforeSendTransaction!(transaction, {}) as TransactionEvent
    expect(scrubbedError.request).toEqual({ url: 'https://ww-proxy.test/accounts/v1/passkeys/assert', method: 'POST' })
    expect(JSON.stringify(scrubbedTransaction)).not.toContain('secret')
  })

  it('drops bearer, admin, and dev bypass tokens from events and transactions', () => {
    const headers = () => ({
      Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.c2ln',
      'x-ww-admin-token': 'admin-secret',
      'X-WW-Dev-Bypass': 'bypass-secret',
      'x-authorization-hint': 'kept',
      accept: 'application/json',
    })
    const kept = { 'x-authorization-hint': 'kept', accept: 'application/json' }
    const error: ErrorEvent = {
      type: undefined,
      request: { url: 'https://ww-proxy.test/accounts/v1/account/info', headers: headers() },
    }
    const transaction: TransactionEvent = {
      type: 'transaction',
      request: { url: 'https://ww-proxy.test/admin/accounts/status', headers: headers() },
    }

    expect((config.beforeSend!(error, {}) as ErrorEvent).request?.headers).toEqual(kept)
    expect(
      (config.beforeSendTransaction!(transaction, {}) as TransactionEvent).request?.headers
    ).toEqual(kept)
  })

  it('cuts subscribe tokens from URLs, query strings, spans, and breadcrumbs', () => {
    const SECRET = 'legacy-subscribe-token-0123456789'
    const url = `https://ww-proxy.test/notes-import/imp_0123/events?token=${SECRET}&lastEventId=3`
    const redactedUrl =
      'https://ww-proxy.test/notes-import/imp_0123/events?token=[redacted]&lastEventId=3'
    const request = (queryString: unknown) =>
      ({
        url,
        query_string: queryString,
        headers: { referer: url, accept: 'text/event-stream' },
      }) as ErrorEvent['request']
    const trace = {
      trace_id: 't',
      span_id: 's',
      data: { 'url.full': url, 'url.query': `token=${SECRET}&lastEventId=3` },
    }

    const error = config.beforeSend!(
      {
        type: undefined,
        message: `stream failed for ${url}`,
        request: request(`token=${SECRET}&lastEventId=3`),
        breadcrumbs: [{ category: 'fetch', data: { url } }],
        contexts: { trace },
      },
      {}
    ) as ErrorEvent
    expect(JSON.stringify(error)).not.toContain(SECRET)
    expect(error.request).toEqual({
      url: redactedUrl,
      query_string: 'token=[redacted]&lastEventId=3',
      headers: { referer: redactedUrl, accept: 'text/event-stream' },
    })
    expect(error.contexts?.trace?.data).toEqual({
      'url.full': redactedUrl,
      'url.query': 'token=[redacted]&lastEventId=3',
    })

    // The event format also allows the query as an object or pairs.
    for (const [queryString, expected] of [
      [
        { token: SECRET, lastEventId: '3' },
        { token: '[redacted]', lastEventId: '3' },
      ],
      [
        [['Token', SECRET], ['lastEventId', '3']],
        [['Token', '[redacted]'], ['lastEventId', '3']],
      ],
      // Keys as they were sent, still encoded.
      [
        { 'to%6Ben': SECRET, 'api%4Bey': SECRET, lastEventId: '3' },
        { 'to%6Ben': '[redacted]', 'api%4Bey': '[redacted]', lastEventId: '3' },
      ],
      [
        [['%74oken', SECRET], ['lastEventId', '3']],
        [['%74oken', '[redacted]'], ['lastEventId', '3']],
      ],
      [
        [['q', '12 Oak Rd'], ['limit', '5'], ['in', 'circle:35.3,-79.1;r=1000000']],
        [['q', '[redacted]'], ['limit', '5'], ['in', '[redacted]']],
      ],
    ]) {
      const scrubbed = config.beforeSend!(
        { type: undefined, request: request(queryString) },
        {}
      ) as ErrorEvent
      expect(scrubbed.request?.query_string).toEqual(expected)
    }

    const transaction = config.beforeSendTransaction!(
      {
        type: 'transaction',
        transaction: 'GET /notes-import/imp_0123/events',
        request: request(`token=${SECRET}`),
        contexts: { trace },
        spans: [
          {
            span_id: 'c',
            trace_id: 't',
            start_timestamp: 0,
            description: `GET ${url}`,
            data: { 'url.full': url, 'http.query': `?token=${SECRET}` },
          },
        ],
      },
      {}
    ) as TransactionEvent
    expect(JSON.stringify(transaction)).not.toContain(SECRET)
    expect(transaction.spans?.[0]).toMatchObject({
      description: `GET ${redactedUrl}`,
      data: { 'url.full': redactedUrl, 'http.query': '?token=[redacted]' },
    })

    expect(
      config.beforeBreadcrumb!({
        category: 'fetch',
        message: `GET ${url}`,
        data: { url, status_code: 200 },
      })
    ).toEqual({
      category: 'fetch',
      message: `GET ${redactedUrl}`,
      data: { url: redactedUrl, status_code: 200 },
    })
  })

  it('leaves events without contact links untouched', () => {
    const event: TransactionEvent = {
      type: 'transaction',
      transaction: 'GET /c/:payload',
      request: { url: 'https://ww-proxy.leviwilkerson.com/geocode?limit=1' },
    }
    const snapshot = structuredClone(event)

    expect(config.beforeSendTransaction!(event, {})).toEqual(snapshot)
  })
})

describe('trace sampling', () => {
  const sample = (name: string, development = false, parentSampled?: boolean) =>
    createSentryConfig({ APP_ATTEST_ENVIRONMENT: development ? 'development' : 'production' } as Environment)
      .tracesSampler!({ name, transactionContext: { name }, parentSampled })

  it.each(['GET /notes-import/status', 'GET /attestation/v1/status', 'GET /geocode', 'GET /autocomplete', 'GET /health', 'GET /c/private-payload', 'GET /contacts', 'GET /unknown'])(
    'samples routine transaction %s at 10%, including sampled parents', (name) => {
      expect(sample(name)).toBe(0.1)
      expect(sample(name, false, true)).toBe(0.1)
    }
  )
  it.each(['POST /notes-import', 'POST /notes-import/kickoff', 'POST /notes-import/challenge', 'POST /notes-import/attest', 'GET /notes-import/id/events', 'POST /attestation/v1/challenge', 'POST /attestation/v1/register', 'POST /attestation/v1/verify'])(
    'retains import transaction %s even with an unsampled parent', (name) => {
      expect(sample(name, false, false)).toBe(1)
    }
  )
  it('keeps full tracing on a development worker without changing error sampling or redaction', () => {
    expect(sample('GET /notes-import/status', true)).toBe(1)
    expect(config.sampleRate).toBeUndefined()
    expect(config.beforeSend).toBeTypeOf('function')
    expect(config.beforeSendTransaction).toBeTypeOf('function')
  })
})

describe('database errors', () => {
  // What Drizzle puts in a failed query's message: ids, token hashes.
  const ACCOUNT_ID = 'AcctAcctAcctAcctAcct0w'
  const TOKEN_HASH = 'HashHashHashHashHashHashHashHashHashHashHa0'
  const QUERY =
    'select "id", "account_id" from "account_sessions" where "account_sessions"."refresh_hash" = ? and "account_sessions"."account_id" = ?'
  const queryError = () =>
    new DrizzleQueryError(
      QUERY,
      [TOKEN_HASH, ACCOUNT_ID],
      new Error(`D1_TYPE_ERROR: Type 'object' not supported for value '${ACCOUNT_ID}'`)
    )

  let recorder: SentryRecorder
  beforeEach(() => {
    recorder = recordSentryEvents()
  })
  afterEach(() => recorder.stop())

  const leaks = (value: unknown) => {
    const text = JSON.stringify(value)
    return text.includes(ACCOUNT_ID) || text.includes(TOKEN_HASH)
  }

  it('reports a database error, or one it caused, as the operation alone', () => {
    const error = queryError()
    expect(isDatabaseError(error)).toBe(true)
    const reported = reportableError(error, 'session/refresh') as Error
    expect(reported).toBeInstanceOf(DatabaseError)
    expect(reported.name).toBe('DatabaseError')
    expect(reported.message).toBe('database query failed: session/refresh')
    expect(reported.cause).toBeUndefined()
    expect(Object.keys(reported)).toEqual(['name'])
    // The stack keeps the frames and nothing from the query.
    expect(reported.stack).toMatch(
      /^DatabaseError: database query failed: session\/refresh\n\s+at /
    )
    expect(reported.stack).not.toContain('Failed query')
    expect(leaks(reported.stack)).toBe(false)

    const wrapped = new Error('kickoff failed', { cause: queryError() })
    expect(reportableError(wrapped, 'kickoff')).toBeInstanceOf(DatabaseError)
    const d1 = new Error(`D1_ERROR: no such column: ${ACCOUNT_ID}`)
    expect(reportableError(d1, 'account status')).toBeInstanceOf(DatabaseError)
  })

  it('reports anything else unchanged', () => {
    const plain = new Error('RPC reply lost', { cause: new Error('socket') })
    expect(isDatabaseError(plain)).toBe(false)
    expect(reportableError(plain, 'inbox/sync')).toBe(plain)
    expect(reportableError('text', 'inbox/sync')).toBe('text')
    const loop = new Error('loop') as Error & { cause?: unknown }
    loop.cause = loop
    expect(reportableError(loop, 'inbox/sync')).toBe(loop)
  })

  it('captureFailure sends the operation, never the query', async () => {
    captureFailure(queryError(), 'session/refresh')
    const events = await recorder.events()
    expect(events).toHaveLength(1)
    expect(events[0].exception?.values).toEqual([
      expect.objectContaining({
        type: 'DatabaseError',
        value: 'database query failed: session/refresh',
      }),
    ])
    expect(leaks(events)).toBe(false)
  })

  it('captureOperationFailure sends the operation alone, for any error', async () => {
    const error = new Error(`no such column: ${ACCOUNT_ID}`, {
      cause: new Error(TOKEN_HASH),
    })
    captureOperationFailure(error, 'spaces/put')
    const [event] = await recorder.events()
    expect(event.exception?.values).toEqual([
      expect.objectContaining({ type: 'OperationError', value: 'spaces/put' }),
    ])
    expect(leaks(event)).toBe(false)
  })

  it('beforeSend redacts a raw query error and drops its cause chain', async () => {
    Sentry.captureException(queryError())
    const [event] = await recorder.events()
    expect(event.exception?.values).toEqual([
      expect.objectContaining({ type: 'Error', value: '[redacted database query]' }),
    ])
    expect(leaks(event)).toBe(false)
  })

  it('beforeSend keeps the errors above one and drops only those below', async () => {
    const deeper = queryError()
    ;(deeper.cause as Error).cause = new Error(`D1 detail ${ACCOUNT_ID}`)
    Sentry.captureException(new Error('settling failed', { cause: deeper }))
    const [event] = await recorder.events()
    expect(event.exception?.values?.map((value) => value.value)).toEqual([
      '[redacted database query]',
      'settling failed',
    ])
    expect(leaks(event)).toBe(false)

    // Chains without a database error keep every cause.
    Sentry.captureException(
      new Error('outer', { cause: new Error('middle', { cause: new Error('inner') }) })
    )
    const [, plain] = await recorder.events()
    expect(plain.exception?.values?.map((value) => value.value)).toEqual([
      'inner',
      'middle',
      'outer',
    ])
  })

  it('redacts query text in messages, extras, and breadcrumbs', async () => {
    const text = queryError().message
    Sentry.captureMessage(`accounts: ${text}`)
    const [event] = await recorder.events()
    expect(event.message).toBe('accounts: [redacted database query]')

    const scrubbed = config.beforeSend!(
      { type: undefined, extra: { detail: { reason: text } } },
      {}
    ) as ErrorEvent
    expect(scrubbed.extra).toEqual({
      detail: { reason: '[redacted database query]' },
    })
    expect(
      config.beforeBreadcrumb!({ message: `failed: ${text}` }, {})
    ).toEqual({ message: 'failed: [redacted database query]' })
    // Truncated before `params:`, the query alone still goes.
    expect(redactDatabaseErrors(`Failed query: ${QUERY.slice(0, 40)}…`)).toBe(
      '[redacted database query]'
    )
    expect(redactDatabaseErrors(`x\nparams: ${ACCOUNT_ID}`)).toBe(
      'x[redacted database query]'
    )
    expect(redactDatabaseErrors('No query here; params are fine')).toBe(
      'No query here; params are fine'
    )
  })
})

describe('HERE proxy requests', () => {
  it('sends neither the search text nor the location', () => {
    const ADDRESS = '12 Oak Rd Springfield'
    const url =
      'https://ww-proxy.test/autocomplete?q=12+Oak+Rd+Springfield&limit=5&in=circle%3A35.3289%2C-79.1165%3Br%3D1000000'
    const redactedUrl =
      'https://ww-proxy.test/autocomplete?q=[redacted]&limit=5&in=[redacted]'
    const config = createSentryConfig({
      SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
      APP_ATTEST_ENVIRONMENT: 'production',
    } as Environment)
    const transaction = config.beforeSendTransaction!(
      {
        type: 'transaction',
        transaction: 'GET /autocomplete',
        request: {
          url,
          query_string: 'q=12+Oak+Rd+Springfield&limit=5&in=circle%3A35.3289%2C-79.1165%3Br%3D1000000',
          headers: { referer: url },
        },
        contexts: {
          trace: {
            trace_id: 't',
            span_id: 's',
            data: {
              'url.full': url,
              'http.query': '?q=12+Oak+Rd+Springfield&limit=5',
              'url.query': 'q=12+Oak+Rd+Springfield&limit=5',
            },
          },
        },
      },
      {}
    ) as TransactionEvent
    const sent = JSON.stringify(transaction)
    for (const leaked of ['Oak', '35.3289', '79.1165', ADDRESS]) {
      expect(sent).not.toContain(leaked)
    }
    expect(transaction.request?.url).toBe(redactedUrl)
    expect(transaction.contexts?.trace?.data).toEqual({
      'url.full': redactedUrl,
      'http.query': '?q=[redacted]&limit=5',
      'url.query': 'q=[redacted]&limit=5',
    })
  })
})
