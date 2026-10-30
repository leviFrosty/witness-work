import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { AttestationProof } from '@/lib/attestation/appAttest'
import { RELAY_ID_PATTERN, utf8 } from '@/lib/bytes'
import { HttpError, request } from '@/lib/http/request'
import {
  ACCOUNT_TIMEOUT_MS,
  type AccountStatus,
  isAccountStatus,
  type SignedAccountOptions,
  sendSignedAccountOp,
} from '@/lib/serverAccount/client'

/**
 * The wire half of account sessions (docs/accounts-protocol.md, "Sessions"):
 * open (`POST /accounts/v1/sessions`), refresh (`POST …/sessions/refresh`), and
 * close (`DELETE …/sessions/current`). The attestation's challenge comes from
 * `POST /attestation/v1/challenge`, through the attestation helper.
 * `session.ts` decides when to call them.
 */

/**
 * What the session's attestation binds, both as `contentHash` and
 * `requestHash`: `hex(SHA-256(UTF-8("ww-account/v1/session\n" + accountPub)))`,
 * so the proof covers the account key and can't open a session for another.
 */
export function sessionAttestationHash(accountPub: string): string {
  return bytesToHex(sha256(utf8(`ww-account/v1/session\n${accountPub}`)))
}

/** What `session/open` answers. */
export type OpenedSession = {
  accountId: string
  status: AccountStatus
  sessionId: string
  accessToken: string
  /** Epoch ms, the server's clock; also for the two below. */
  accessExpiresAt: number
  refreshToken: string
  sessionExpiresAt: number
}

/** What `session/refresh` answers: a new pair, the same session. */
export type RefreshedSession = Pick<
  OpenedSession,
  'accessToken' | 'accessExpiresAt' | 'refreshToken' | 'sessionExpiresAt'
>

export type SessionClientOptions = {
  baseUrl: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

/** `major.minor.patch`, at most 32 characters; the server refuses anything else. */
export const isSessionAppVersion = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 32 &&
  /^\d+\.\d+\.\d+$/.test(value)

const url = (baseUrl: string, path: string) => `${baseUrl}/accounts/v1/${path}`

const unexpected = (status: number) =>
  new HttpError('server', status, 'unexpected_response')

const isToken = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 4096

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

function parseTokens(
  data: Record<string, unknown> | null,
  status: number
): RefreshedSession {
  const { accessToken, accessExpiresAt, refreshToken, sessionExpiresAt } =
    data ?? {}
  if (
    data?.ok !== true ||
    !isToken(accessToken) ||
    !isTime(accessExpiresAt) ||
    !isToken(refreshToken) ||
    !isTime(sessionExpiresAt)
  )
    throw unexpected(status)
  return { accessToken, accessExpiresAt, refreshToken, sessionExpiresAt }
}

/**
 * Opens a session (`POST /accounts/v1/sessions`, answered 201): the account
 * key's self-signed envelope (op `session/open`) with the attestation (or, in
 * dev builds, the bypass header) and the sealed device label. Creates the
 * account when the key has none, unless `accountId` names the account the
 * device knows: then it opens only when the key is that account's current one,
 * and is 404 `unknown_account` otherwise (docs/account-key-change.md). A
 * retired key is 403 `key_retired`. Failures throw `HttpError`.
 */
export async function sendSessionOpen(
  {
    proof,
    device,
    appVersion,
    accountId,
  }: {
    proof: AttestationProof
    /** `sealDeviceLabel`'s output. */
    device?: string
    /** This build's `major.minor.patch`; the session keeps the latest. */
    appVersion?: string
    /** The account this key should be the current key of. */
    accountId?: string
  },
  options: SignedAccountOptions
): Promise<OpenedSession> {
  const response = await sendSignedAccountOp<Record<string, unknown>>(
    'session/open',
    {
      ...(proof.kind === 'attestation' && { attestation: proof.fields }),
      ...(device !== undefined && { device }),
      ...(isSessionAppVersion(appVersion) && { appVersion }),
      ...(accountId !== undefined && { accountId }),
    },
    options,
    {
      headers:
        proof.kind === 'devBypass'
          ? { 'x-ww-dev-bypass': proof.token }
          : undefined,
    }
  )
  return parseOpenedSession(response.data ?? null, response.status)
}

/** `session/open`'s answer, which `web/signup` shares. */
export function parseOpenedSession(
  data: Record<string, unknown> | null,
  status: number
): OpenedSession {
  const tokens = parseTokens(data, status)
  const { accountId, status: accountStatus, sessionId } = data ?? {}
  if (
    typeof accountId !== 'string' ||
    !RELAY_ID_PATTERN.test(accountId) ||
    !isAccountStatus(accountStatus) ||
    typeof sessionId !== 'string' ||
    sessionId.length === 0 ||
    sessionId.length > 64
  )
    throw unexpected(status)
  return { accountId, status: accountStatus, sessionId, ...tokens }
}

/**
 * `POST /accounts/v1/sessions/refresh`: replaces the refresh token, and tells
 * the session this build's version. A 401 means the session ended or expired
 * (its `reason` says which), and a new one has to be opened. Failures throw
 * `HttpError`.
 */
export async function refreshSession(
  refreshToken: string,
  options: SessionClientOptions & { appVersion?: string }
): Promise<RefreshedSession> {
  const { appVersion } = options
  const response = await request<Record<string, unknown> | null>({
    url: url(options.baseUrl, 'sessions/refresh'),
    json: {
      refreshToken,
      ...(isSessionAppVersion(appVersion) && { appVersion }),
    },
    timeoutMs: ACCOUNT_TIMEOUT_MS,
    signal: options.signal,
    fetchImpl: options.fetchImpl,
  })
  return parseTokens(response.data ?? null, response.status)
}

/**
 * `DELETE /accounts/v1/sessions/current`: ends the token's session; repeating
 * it is `ok`.
 */
export async function closeSession(
  accessToken: string,
  options: SessionClientOptions
): Promise<void> {
  const response = await request<{ ok?: boolean } | null>({
    url: url(options.baseUrl, 'sessions/current'),
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
    timeoutMs: ACCOUNT_TIMEOUT_MS,
    idempotent: true,
    retry: { retries: 1 },
    signal: options.signal,
    fetchImpl: options.fetchImpl,
  })
  if (response.data?.ok !== true) throw unexpected(response.status)
}
