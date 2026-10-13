import { HttpError, request } from '@/lib/http/request'
import { RELAY_ID_PATTERN, toB64u, utf8 } from '@/lib/bytes'
import {
  type AccountSigningKey,
  signAccountRequest,
} from '@/lib/serverAccount/keys'

/** Client for `/accounts/v1/*` (docs/accounts-protocol.md). */

const TIMEOUT_MS = 15 * 1000

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

/**
 * The account for this signing key, created on first use; the same key always
 * gets the same account. A `stale` answer carries the server's clock, and the
 * request is signed again once with it. Failures throw `HttpError`.
 */
export async function registerAccount(
  options: RegisterAccountOptions
): Promise<RegisteredAccount> {
  const send = async (ts: number) => {
    const payload = utf8(
      JSON.stringify({
        accountPub: options.key.publicKey,
        ts,
        nonce: toB64u(options.randomBytes(16)),
      })
    )
    return request<{ ok?: boolean; accountId?: unknown; status?: unknown }>({
      url: `${options.baseUrl}/accounts/v1/account/register`,
      json: {
        p: toB64u(payload),
        s: signAccountRequest('account/register', payload, options.key),
      },
      timeoutMs: TIMEOUT_MS,
      signal: options.signal,
      fetchImpl: options.fetchImpl,
    })
  }
  let response
  try {
    response = await send(options.now())
  } catch (error) {
    const serverTime = staleServerTime(error)
    if (serverTime === null) throw error
    response = await send(serverTime)
  }
  const { accountId, status } = response.data ?? {}
  if (
    response.data?.ok !== true ||
    typeof accountId !== 'string' ||
    !RELAY_ID_PATTERN.test(accountId) ||
    (status !== 'active' && status !== 'suspended')
  )
    throw new HttpError('server', response.status, 'unexpected_response')
  return { accountId, status }
}

function staleServerTime(error: unknown): number | null {
  if (!(error instanceof HttpError) || error.serverCode !== 'stale') return null
  const body = error.body as { serverTime?: unknown } | null
  return typeof body?.serverTime === 'number' && body.serverTime > 0
    ? body.serverTime
    : null
}
