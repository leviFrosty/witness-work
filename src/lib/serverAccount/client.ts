import {
  HttpError,
  type HttpResponse,
  request,
  type RequestOptions,
} from '@/lib/http/request'
import { RELAY_ID_PATTERN, toB64u, utf8 } from '@/lib/bytes'
import {
  type AccountSigningKey,
  signAccountRequest,
} from '@/lib/serverAccount/keys'

/**
 * Client for `/accounts/v1/*` (docs/accounts-protocol.md,
 * docs/passkeys-protocol.md). Most ops are **Bearer**: they carry the attested
 * session's access token (`session.ts`). `session/open`, `web/signup` and
 * `web/recovery` are signed by the account key instead, and `backup/delete`,
 * `sync/request` (asking) and the `passkey/*` ops by both. Signed envelopes are
 * `{ payload, signature }`.
 */

export const ACCOUNT_TIMEOUT_MS = 15 * 1000

export type AccountStatus = 'active' | 'suspended'

export const isAccountStatus = (value: unknown): value is AccountStatus =>
  value === 'active' || value === 'suspended'

/** How a self-signed op is signed and sent. */
export type SignedAccountOptions = {
  baseUrl: string
  key: AccountSigningKey
  /** Request timestamps; the server refuses one 5 minutes off its clock. */
  now: () => number
  randomBytes: (length: number) => Uint8Array
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

/**
 * Ops signed by the account key (docs/accounts-protocol.md). The op name is the
 * signature's context; the route is its own.
 */
export type SignedAccountOp =
  | 'session/open'
  | 'backup/delete'
  | 'passkey/add'
  | 'passkey/wrap'
  | 'passkey/remove'
  | 'web/signup'
  | 'web/recovery'
  | 'sync/request'

const SIGNED_PATHS: Record<SignedAccountOp, string> = {
  'session/open': 'sessions',
  'backup/delete': 'backup/delete',
  'passkey/add': 'passkeys',
  'passkey/wrap': 'passkeys/wrap',
  'passkey/remove': 'passkeys/remove',
  'web/signup': 'web/signup',
  'web/recovery': 'web/recovery',
  'sync/request': 'sync/request',
}

/** How one signed op travels, past the default JSON envelope and answer. */
export type SignedAccountTransport = {
  /** Sent too: the dev bypass, or the bearer token of a step-up op. */
  headers?: Record<string, string>
  timeoutMs?: number
  /** Repeating it can't do anything twice, so a lost answer is retried once. */
  idempotent?: boolean
  /** Sent beside the envelope, outside what's signed (`requested: true`). */
  body?: Record<string, unknown>
}

/**
 * Sends a self-signed account op: `accountPub`, `ts`, `nonce`, and the op's own
 * `fields`. A `stale` answer carries the server's clock, and the request is
 * signed again once with it. Failures throw `HttpError`.
 */
export async function sendSignedAccountOp<T>(
  op: SignedAccountOp,
  fields: Record<string, unknown>,
  options: SignedAccountOptions,
  transport: SignedAccountTransport = {}
) {
  const send = async (ts: number) => {
    const payload = utf8(
      JSON.stringify({
        ...fields,
        accountPub: options.key.publicKey,
        ts,
        nonce: toB64u(options.randomBytes(16)),
      })
    )
    return request<T>({
      url: `${options.baseUrl}/accounts/v1/${SIGNED_PATHS[op]}`,
      method: 'POST',
      json: {
        ...transport.body,
        payload: toB64u(payload),
        signature: signAccountRequest(op, payload, options.key),
      },
      headers: transport.headers,
      timeoutMs: transport.timeoutMs ?? ACCOUNT_TIMEOUT_MS,
      idempotent: transport.idempotent,
      retry: transport.idempotent ? { retries: 1 } : undefined,
      signal: options.signal,
      fetchImpl: options.fetchImpl,
    })
  }
  try {
    return await send(options.now())
  } catch (error) {
    const serverTime = staleServerTime(error)
    if (serverTime === null) throw error
    return send(serverTime)
  }
}

/**
 * Runs a request with the account session's `Authorization` header, refreshing
 * the session and running it again after a 401 (`AccountSessions.withSession`
 * for one account key).
 */
export type AccountAuthorize = <T>(
  run: (authorization: string) => Promise<T>
) => Promise<T>

/** How a bearer op reaches the server. */
export type BearerAccountOptions = {
  baseUrl: string
  authorize: AccountAuthorize
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

/** Ops that take the session's bearer token. */
export type BearerAccountOp =
  | 'account/info'
  | 'handoff/open'
  | 'handoff/status'
  | 'handoff/send'
  | 'handoff/cancel'
  | 'backup/put'
  | 'backup/list'
  | 'backup/get'
  | 'sync'
  | 'sync/put'
  | 'sync/list'
  | 'sync/get'
  | 'sync/request'
  | 'sync/delete'
  | 'sync/photos/put'
  | 'sync/photos/list'
  | 'sync/photos/get'
  | 'sync/photos/delete'
  | 'sync/photos/usage'
  | 'passkeys'
  | 'passkeys/challenge'
  | 'passkeys/assert'
  | 'passkeys/register/options'
  | 'approval/claim'
  | 'approval/status'
  | 'approval/send'
  | 'approval/cancel'

/**
 * `GET /accounts/v1/account` reads the account; the rest are `POST
 * /accounts/v1/{op}`, so their ids stay out of URLs.
 */
const BEARER_ROUTES: Partial<
  Record<BearerAccountOp, { method: 'GET'; path: string }>
> = {
  'account/info': { method: 'GET', path: 'account' },
  sync: { method: 'GET', path: 'sync' },
  'sync/photos/usage': { method: 'GET', path: 'sync/photos/usage' },
  passkeys: { method: 'GET', path: 'passkeys' },
}

/** How one bearer op travels, past the default JSON body and answer. */
export type BearerAccountTransport = {
  /**
   * Sent as the raw body (`backup/put`, `sync/put`, `sync/photos/put`), with
   * these headers.
   */
  rawBody?: Uint8Array
  headers?: Record<string, string>
  responseType?: RequestOptions['responseType']
  timeoutMs?: number
  idempotent?: boolean
}

/**
 * Sends a bearer op with `fields` as its JSON body, or no body for `null`.
 * Failures throw `HttpError` (an `AccountSessionError` when there's no session
 * to send it with).
 */
export function sendBearerAccountOp<T>(
  op: BearerAccountOp,
  fields: Record<string, unknown> | null,
  options: BearerAccountOptions,
  transport: BearerAccountTransport = {}
): Promise<HttpResponse<T>> {
  const route = BEARER_ROUTES[op] ?? { method: 'POST', path: op }
  return options.authorize((authorization) =>
    request<T>({
      url: `${options.baseUrl}/accounts/v1/${route.path}`,
      method: route.method,
      ...(transport.rawBody
        ? {
            headers: {
              ...transport.headers,
              authorization,
              'content-type': 'application/octet-stream',
            },
            body: transport.rawBody,
          }
        : {
            headers: { ...transport.headers, authorization },
            ...(fields !== null && { json: fields }),
          }),
      responseType: transport.responseType,
      timeoutMs: transport.timeoutMs ?? ACCOUNT_TIMEOUT_MS,
      idempotent: transport.idempotent,
      retry: transport.idempotent ? { retries: 1 } : undefined,
      signal: options.signal,
      fetchImpl: options.fetchImpl,
    })
  )
}

/** Bearer ops, and the account key's signature for the ones that need both. */
export type BearerSignedAccountOptions = BearerAccountOptions & {
  sign: SignedAccountOptions
}

/**
 * Sends a signed op with the session's bearer token too, so a leaked token
 * alone can't run it: the token's account must be the key's. Failures throw
 * `HttpError`.
 */
export async function sendBearerSignedAccountOp(
  op: SignedAccountOp,
  fields: Record<string, unknown>,
  options: BearerSignedAccountOptions,
  transport: Pick<SignedAccountTransport, 'idempotent'> = {}
): Promise<AccountAnswer> {
  const response = await options.authorize((authorization) =>
    sendSignedAccountOp<AccountAnswer['data']>(
      op,
      fields,
      { ...options.sign, signal: options.signal },
      { headers: { authorization }, idempotent: transport.idempotent }
    )
  )
  return { status: response.status, data: response.data ?? null }
}

/** Ops sent as plain JSON: no session yet, or authorized by their own token. */
export type PlainAccountOp =
  | 'handoff/claim'
  | 'handoff/receive'
  | 'handoff/done'
  | 'handoff/cancel'
  | 'approval/open'
  | 'approval/status'
  | 'approval/receive'
  | 'approval/done'
  | 'approval/cancel'
  | 'passkeys/challenge'
  | 'passkeys/assert'
  | 'web/signup/options'

/** No session: signing in or up, a new phone, a browser approving. */
export type PlainAccountOptions = {
  baseUrl: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

/** A JSON answer: its HTTP status and its body, `null` without one. */
export type AccountAnswer = {
  status: number
  data: Record<string, unknown> | null
}

/** Sends a plain JSON op. Failures throw `HttpError`. */
export async function sendPlainAccountOp(
  op: PlainAccountOp,
  json: Record<string, unknown>,
  options: PlainAccountOptions
): Promise<AccountAnswer> {
  const response = await request<AccountAnswer['data']>({
    url: `${options.baseUrl}/accounts/v1/${op}`,
    json,
    timeoutMs: ACCOUNT_TIMEOUT_MS,
    signal: options.signal,
    fetchImpl: options.fetchImpl,
  })
  return { status: response.status, data: response.data ?? null }
}

/** `sendBearerAccountOp` for a JSON answer. */
export async function sendBearerAccountJson(
  op: BearerAccountOp,
  fields: Record<string, unknown> | null,
  options: BearerAccountOptions,
  transport: Pick<BearerAccountTransport, 'idempotent'> = {}
): Promise<AccountAnswer> {
  const response = await sendBearerAccountOp<AccountAnswer['data']>(
    op,
    fields,
    options,
    transport
  )
  return { status: response.status, data: response.data ?? null }
}

/** An answer this client can't read. */
export const unexpectedResponse = (status: number) =>
  new HttpError('server', status, 'unexpected_response')

/** Throws unless the answer is `{ ok: true }`. */
export function okOnly(response: AccountAnswer): void {
  if (response.data?.ok !== true) throw unexpectedResponse(response.status)
}

/** The answer's `expiresAt`, epoch ms; throws unless it's `ok` with one. */
export function expiresAtOf(response: AccountAnswer): number {
  const value = response.data?.expiresAt
  if (response.data?.ok !== true || typeof value !== 'number' || value <= 0)
    throw unexpectedResponse(response.status)
  return value
}

/** A non-empty string, or `undefined`. */
export const optionalString = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : undefined

/** What the server holds for this device's own account (`account/info`). */
export type ServerAccountInfo = {
  accountId: string
  status: AccountStatus
  accountPub: string
  createdAt: number
  inboxIds: string[]
  statusChanges: { status: AccountStatus; createdAt: number }[]
}

/**
 * Reads the session's account (`GET /accounts/v1/account`): its status, which
 * inboxes it holds, and its history. Failures throw `HttpError`.
 */
export async function fetchAccountInfo(
  options: BearerAccountOptions
): Promise<ServerAccountInfo> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'account/info',
    null,
    options,
    { idempotent: true }
  )
  const data = response.data ?? {}
  const { accountId, accountPub, status, createdAt, inboxIds, statusChanges } =
    data
  if (
    data.ok !== true ||
    typeof accountId !== 'string' ||
    !RELAY_ID_PATTERN.test(accountId) ||
    typeof accountPub !== 'string' ||
    !isAccountStatus(status) ||
    typeof createdAt !== 'number' ||
    !Array.isArray(inboxIds) ||
    !inboxIds.every((id) => typeof id === 'string') ||
    !Array.isArray(statusChanges) ||
    !statusChanges.every(
      (change) =>
        isAccountStatus(change?.status) && typeof change?.createdAt === 'number'
    )
  )
    throw new HttpError('server', response.status, 'unexpected_response')
  return {
    accountId,
    accountPub,
    status,
    createdAt,
    inboxIds,
    statusChanges: statusChanges.map(
      (change: { status: AccountStatus; createdAt: number }) => ({
        status: change.status,
        createdAt: change.createdAt,
      })
    ),
  }
}

function staleServerTime(error: unknown): number | null {
  if (!(error instanceof HttpError) || error.serverCode !== 'stale') return null
  const body = error.body as { serverTime?: unknown } | null
  return typeof body?.serverTime === 'number' && body.serverTime > 0
    ? body.serverTime
    : null
}
