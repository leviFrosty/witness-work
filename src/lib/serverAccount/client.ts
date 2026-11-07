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

export type SignedAccountOp =
  | 'session/open'
  | 'backup/delete'
  | 'passkey/add'
  | 'passkey/wrap'
  | 'passkey/remove'
  | 'web/signup'
  | 'web/recovery'
  | 'sync/request'
  | 'account/rekey'

const SIGNED_PATHS: Record<SignedAccountOp, string> = {
  'session/open': 'sessions',
  'backup/delete': 'backup/delete',
  'passkey/add': 'passkeys',
  'passkey/wrap': 'passkeys/wrap',
  'passkey/remove': 'passkeys/remove',
  'web/signup': 'web/signup',
  'web/recovery': 'web/recovery',
  'sync/request': 'sync/request',
  'account/rekey': 'account/rekey',
}

export type SignedRequest = {
  payload: string
  signature: string
  [cosign: string]: string
}

export type SignedAccountTransport = {
  headers?: Record<string, string>
  timeoutMs?: number

  idempotent?: boolean

  body?: Record<string, unknown>

  signed?: SignedRequest

  onSigned?: (signed: SignedRequest) => void

  cosign?: { field: string; op: string; key: AccountSigningKey }[]
}

export async function sendSignedAccountOp<T>(
  op: SignedAccountOp,
  fields: Record<string, unknown>,
  options: SignedAccountOptions,
  transport: SignedAccountTransport = {}
) {
  const sign = (ts: number): SignedRequest => {
    const payload = utf8(
      JSON.stringify({
        ...fields,
        accountPub: options.key.publicKey,
        ts,
        nonce: toB64u(options.randomBytes(16)),
      })
    )
    const signed: SignedRequest = {
      ...Object.fromEntries(
        (transport.cosign ?? []).map(({ field, op: context, key }) => [
          field,
          signAccountRequest(context, payload, key),
        ])
      ),
      payload: toB64u(payload),
      signature: signAccountRequest(op, payload, options.key),
    }
    transport.onSigned?.(signed)
    return signed
  }
  const send = async (signed: SignedRequest) =>
    request<T>({
      url: `${options.baseUrl}/accounts/v1/${SIGNED_PATHS[op]}`,
      method: 'POST',
      json: { ...transport.body, ...signed },
      headers: transport.headers,
      timeoutMs: transport.timeoutMs ?? ACCOUNT_TIMEOUT_MS,
      idempotent: transport.idempotent,
      retry: transport.idempotent ? { retries: 1 } : undefined,
      signal: options.signal,
      fetchImpl: options.fetchImpl,
    })
  try {
    return await send(transport.signed ?? sign(options.now()))
  } catch (error) {
    const serverTime = staleServerTime(error)
    if (serverTime === null) throw error
    return send(sign(serverTime))
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
  | 'account/key-history'
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
  | 'live/ticket'

const BEARER_ROUTES: Partial<
  Record<BearerAccountOp, { method: 'GET'; path: string }>
> = {
  'account/info': { method: 'GET', path: 'account' },
  'account/key-history': { method: 'GET', path: 'account/key-history' },
  sync: { method: 'GET', path: 'sync' },
  'sync/photos/usage': { method: 'GET', path: 'sync/photos/usage' },
  passkeys: { method: 'GET', path: 'passkeys' },
}

export type BearerAccountTransport = {
  rawBody?: Uint8Array
  headers?: Record<string, string>
  responseType?: RequestOptions['responseType']
  timeoutMs?: number
  idempotent?: boolean

  retryTimeouts?: boolean
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
      retry: transport.idempotent
        ? { retries: 1, retryTimeouts: transport.retryTimeouts }
        : undefined,
      signal: options.signal,
      fetchImpl: options.fetchImpl,
    })
  )
}

export type BearerSignedAccountOptions = BearerAccountOptions & {
  sign: SignedAccountOptions
}

export async function sendBearerSignedAccountOp(
  op: SignedAccountOp,
  fields: Record<string, unknown>,
  options: BearerSignedAccountOptions,
  transport: Pick<SignedAccountTransport, 'idempotent' | 'cosign'> = {}
): Promise<AccountAnswer> {
  const response = await options.authorize((authorization) =>
    sendSignedAccountOp<AccountAnswer['data']>(
      op,
      fields,
      { ...options.sign, signal: options.signal },
      {
        headers: { authorization },
        idempotent: transport.idempotent,
        cosign: transport.cosign,
      }
    )
  )
  return { status: response.status, data: response.data ?? null }
}

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

export type PlainAccountOptions = {
  baseUrl: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export type AccountAnswer = {
  status: number
  data: Record<string, unknown> | null
}

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

export const unexpectedResponse = (status: number) =>
  new HttpError('server', status, 'unexpected_response')

export function okOnly(response: AccountAnswer): void {
  if (response.data?.ok !== true) throw unexpectedResponse(response.status)
}

export function expiresAtOf(response: AccountAnswer): number {
  const value = response.data?.expiresAt
  if (response.data?.ok !== true || typeof value !== 'number' || value <= 0)
    throw unexpectedResponse(response.status)
  return value
}

export const optionalString = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : undefined

export type ServerAccountInfo = {
  accountId: string
  status: AccountStatus
  accountPub: string

  keyEpoch: number
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

  const keyEpoch = data.keyEpoch === undefined ? 0 : data.keyEpoch
  if (
    data.ok !== true ||
    typeof keyEpoch !== 'number' ||
    !Number.isSafeInteger(keyEpoch) ||
    keyEpoch < 0 ||
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
    keyEpoch,
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
