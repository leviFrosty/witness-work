import { HttpError, request } from '@/lib/http/request'
import { RELAY_ID_PATTERN, toB64u, utf8 } from '@/lib/bytes'
import {
  type AccountSigningKey,
  signAccountRequest,
} from '@/lib/serverAccount/keys'

/** Client for `/accounts/v1/*` (docs/accounts-protocol.md). */

export const ACCOUNT_TIMEOUT_MS = 15 * 1000

export type AccountStatus = 'active' | 'suspended'

export type RegisteredAccount = { accountId: string; status: AccountStatus }

export type RegisterAccountOptions = {
  baseUrl: string
  key: AccountSigningKey
  /** Request timestamps; the server refuses one 5 minutes off its clock. */
  now: () => number
  randomBytes: (length: number) => Uint8Array
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

/** Ops signed by the account key (docs/accounts-protocol.md). */
export type SignedAccountOp =
  | 'account/register'
  | 'account/info'
  | 'handoff/open'
  | 'handoff/status'
  | 'handoff/send'
  | 'handoff/cancel'

/**
 * Sends a self-signed account op: `accountPub`, `ts`, `nonce`, and the op's own
 * `fields`. A `stale` answer carries the server's clock, and the request is
 * signed again once with it. Failures throw `HttpError`.
 */
export async function sendSignedAccountOp<T>(
  op: SignedAccountOp,
  fields: Record<string, unknown>,
  options: RegisterAccountOptions
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
      url: `${options.baseUrl}/accounts/v1/${op}`,
      json: {
        p: toB64u(payload),
        s: signAccountRequest(op, payload, options.key),
      },
      timeoutMs: ACCOUNT_TIMEOUT_MS,
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

const isStatus = (value: unknown): value is AccountStatus =>
  value === 'active' || value === 'suspended'

/**
 * The account for this signing key, created on first use; the same key always
 * gets the same account. Failures throw `HttpError`.
 */
export async function registerAccount(
  options: RegisterAccountOptions
): Promise<RegisteredAccount> {
  const response = await sendSignedAccountOp<{
    ok?: boolean
    accountId?: unknown
    status?: unknown
  }>('account/register', {}, options)
  const { accountId, status } = response.data ?? {}
  if (
    response.data?.ok !== true ||
    typeof accountId !== 'string' ||
    !RELAY_ID_PATTERN.test(accountId) ||
    !isStatus(status)
  )
    throw new HttpError('server', response.status, 'unexpected_response')
  return { accountId, status }
}

/** What the server holds for this device's own account (`account/info`). */
export type ServerAccountInfo = RegisteredAccount & {
  accountPub: string
  createdAt: number
  inboxIds: string[]
  statusChanges: { status: AccountStatus; createdAt: number }[]
}

/**
 * Reads this signing key's account, for the developer tools. Never creates one:
 * an unregistered key throws `HttpError` with `unknown_account`.
 */
export async function fetchAccountInfo(
  options: RegisterAccountOptions
): Promise<ServerAccountInfo> {
  const response = await sendSignedAccountOp<Record<string, unknown>>(
    'account/info',
    {},
    options
  )
  const data = response.data ?? {}
  const { accountId, accountPub, status, createdAt, inboxIds, statusChanges } =
    data
  if (
    data.ok !== true ||
    typeof accountId !== 'string' ||
    !RELAY_ID_PATTERN.test(accountId) ||
    typeof accountPub !== 'string' ||
    !isStatus(status) ||
    typeof createdAt !== 'number' ||
    !Array.isArray(inboxIds) ||
    !inboxIds.every((id) => typeof id === 'string') ||
    !Array.isArray(statusChanges) ||
    !statusChanges.every(
      (change) =>
        isStatus(change?.status) && typeof change?.createdAt === 'number'
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
