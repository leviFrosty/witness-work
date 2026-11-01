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

export const ACCOUNT_TIMEOUT_MS = 15 * 1000

export type AccountStatus = 'active' | 'suspended'

export const isAccountStatus = (value: unknown): value is AccountStatus =>
  value === 'active' || value === 'suspended'

export type SignedAccountOptions = {
  baseUrl: string
  key: AccountSigningKey

  now: () => number
  randomBytes: (length: number) => Uint8Array
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export type SignedAccountOp = 'session/open' | 'backup/delete'

const SIGNED_PATHS: Record<SignedAccountOp, string> = {
  'session/open': 'sessions',
  'backup/delete': 'backup/delete',
}

export type SignedAccountTransport = {
  headers?: Record<string, string>
  timeoutMs?: number

  idempotent?: boolean
}

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

export type AccountAuthorize = <T>(
  run: (authorization: string) => Promise<T>
) => Promise<T>

export type BearerAccountOptions = {
  baseUrl: string
  authorize: AccountAuthorize
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

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
  | 'sync/delete'

const BEARER_ROUTES: Partial<
  Record<BearerAccountOp, { method: 'GET'; path: string }>
> = {
  'account/info': { method: 'GET', path: 'account' },
  sync: { method: 'GET', path: 'sync' },
}

export type BearerAccountTransport = {
  rawBody?: Uint8Array
  headers?: Record<string, string>
  responseType?: RequestOptions['responseType']
  timeoutMs?: number
  idempotent?: boolean
}

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

export type ServerAccountInfo = {
  accountId: string
  status: AccountStatus
  accountPub: string
  createdAt: number
  inboxIds: string[]
  statusChanges: { status: AccountStatus; createdAt: number }[]
}

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
