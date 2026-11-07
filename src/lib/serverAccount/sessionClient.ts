import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { AttestationProof } from '@/lib/attestation/appAttest'
import { RELAY_ID_PATTERN, utf8 } from '@/lib/bytes'
import { isKnownOffline } from '@/lib/http/online'
import { HttpError, request } from '@/lib/http/request'
import {
  ACCOUNT_TIMEOUT_MS,
  type AccountStatus,
  isAccountStatus,
  type SignedAccountOptions,
  type SignedAccountTransport,
  sendSignedAccountOp,
} from '@/lib/serverAccount/client'
import { SESSION_CAPABILITIES } from '@/lib/serverAccount/capabilities'

export function sessionAttestationHash(accountPub: string): string {
  return bytesToHex(sha256(utf8(`ww-account/v1/session\n${accountPub}`)))
}

export type OpenedSession = {
  accountId: string
  status: AccountStatus
  sessionId: string
  accessToken: string

  accessExpiresAt: number
  refreshToken: string
  sessionExpiresAt: number
}

export type RefreshedSession = Pick<
  OpenedSession,
  'accessToken' | 'accessExpiresAt' | 'refreshToken' | 'sessionExpiresAt'
>

export type SessionClientOptions = {
  baseUrl: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

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

export async function sendSessionOpen(
  {
    proof,
    device,
    appVersion,
    accountId,
    renews,
  }: {
    proof: AttestationProof

    device?: string

    appVersion?: string

    accountId?: string

    renews?: { sessionId: string; accessToken: string }
  },
  options: SignedAccountOptions
): Promise<OpenedSession> {
  const response = await sendSignedAccountOp<Record<string, unknown>>(
    'session/open',
    {
      ...(proof.kind === 'attestation' && { attestation: proof.fields }),
      ...(device !== undefined && { device }),
      ...(isSessionAppVersion(appVersion) && { appVersion }),
      capabilities: SESSION_CAPABILITIES,
      ...(accountId !== undefined && { accountId }),
      ...(renews && { renews: renews.sessionId }),
    },
    options,
    {
      headers:
        proof.kind === 'devBypass' || renews
          ? {
              ...(proof.kind === 'devBypass' && {
                'x-ww-dev-bypass': proof.token,
              }),
              ...(renews && { authorization: `Bearer ${renews.accessToken}` }),
            }
          : undefined,
    }
  )
  return parseOpenedSession(response.data ?? null, response.status)
}

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

export const REFRESH_RETRY_MAX_DELAY_MS = 2_000

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

      capabilities: SESSION_CAPABILITIES,
    },
    timeoutMs: ACCOUNT_TIMEOUT_MS,

    ...(!isKnownOffline() && {
      idempotent: true,
      retry: { retries: 1, maxDelayMs: REFRESH_RETRY_MAX_DELAY_MS },
    }),
    signal: options.signal,
    fetchImpl: options.fetchImpl,
  })
  return parseTokens(response.data ?? null, response.status)
}

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

export async function sendWebSessionOpen(
  {
    ticket,
    device,
    appVersion,
  }: {
    ticket: string

    device?: string
    appVersion?: string
  },
  options: SignedAccountOptions,
  signed: Pick<SignedAccountTransport, 'signed' | 'onSigned'> = {}
): Promise<OpenedSession> {
  const response = await sendSignedAccountOp<Record<string, unknown>>(
    'session/open',
    {
      ticket,
      ...(device !== undefined && { device }),
      ...(isSessionAppVersion(appVersion) && { appVersion }),
      capabilities: SESSION_CAPABILITIES,
    },
    options,
    { idempotent: true, ...signed }
  )
  return parseOpenedSession(response.data ?? null, response.status)
}
