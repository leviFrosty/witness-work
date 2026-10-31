import type { HttpResponse, RequestOptions } from '@/lib/http/request'
import { RELAY_ID_PATTERN } from '@/lib/bytes'
import { ACCOUNT_TIMEOUT_MS } from '@/lib/serverAccount/client'

/**
 * Client for the account's devices and activity log (ADR 0028,
 * docs/accounts-protocol.md "Activity and devices"): `GET /sessions`, `POST
 * /sessions/revoke`, and `GET /activity`, all Bearer. Answers are checked field
 * by field; an entry of a kind this version doesn't know, or one that doesn't
 * parse, is skipped, so the server can add kinds first.
 */

/** `accountSessions.request`, or a stand-in for tests. */
export type AuthorizedRequest = <T>(
  options: RequestOptions
) => Promise<HttpResponse<T>>

export type ActivityClientOptions = {
  baseUrl: string
  request: AuthorizedRequest
  signal?: AbortSignal
}

export type SessionPlatform = 'ios' | 'android' | 'web' | 'dev'

const isPlatform = (value: unknown): value is SessionPlatform =>
  value === 'ios' || value === 'android' || value === 'web' || value === 'dev'

const METHODS = [
  'attestation',
  'dev',
  'passkey',
  'approval',
  'recovery',
  'signup',
] as const

/** How a session opened (docs/passkeys-protocol.md, "Activity"). */
export type SessionMethod = (typeof METHODS)[number]

const optionalMethod = (value: unknown): SessionMethod | null =>
  (METHODS as readonly unknown[]).includes(value)
    ? (value as SessionMethod)
    : null

/** One signed-in device: a live session. */
export type AccountDevice = {
  sessionId: string
  /** Null for a platform this version doesn't know. */
  platform: SessionPlatform | null
  /** The sealed device label, when the session sent one. */
  device: string | null
  /** The app version the session last reported; browsers send it. */
  appVersion: string | null
  /** The session the request's token belongs to: this device. */
  current: boolean
  createdAt: number
  lastActiveAt: number
  expiresAt: number
}

/** Kinds this version shows. */
export const ACTIVITY_KINDS = [
  'account.created',
  'session.opened',
  'session.signed_out',
  'session.revoked',
  'session.replaced',
  'session.refresh_reused',
  'handoff.sent',
  'backup.deleted',
  'backup.downloaded',
  'account.suspended',
  'account.reinstated',
  'buddies.inbox_linked',
  'buddies.deleted',
  'passkey.added',
  'passkey.removed',
  'device.approved',
  'account.key_changed',
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

const isActivityKind = (value: unknown): value is ActivityKind =>
  (ACTIVITY_KINDS as readonly unknown[]).includes(value)

/** A session an entry names. */
export type ActivitySession = {
  sessionId: string
  platform: SessionPlatform | null
  device: string | null
}

export type ActivityEntry = {
  id: string
  kind: ActivityKind
  createdAt: number
  /** The session the entry is about, or that did it. */
  session: ActivitySession | null
  /** `session.opened`: how it opened. */
  method: SessionMethod | null
  /**
   * For `session.revoked` and `session.replaced`, the session that ended it;
   * for an `approval` `session.opened`, the phone that approved it.
   */
  actor: ActivitySession | null
  /** `backup.*`; null on `backup.deleted` means every slot. */
  slotId: string | null
}

export type ActivityPage = {
  entries: ActivityEntry[]
  /** The next (older) page's cursor; null on the last page. */
  nextCursor: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isId = (value: unknown): value is string =>
  typeof value === 'string' && RELAY_ID_PATTERN.test(value)

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

export function parseDevice(value: unknown): AccountDevice | null {
  if (!isRecord(value)) return null
  const { sessionId, platform, current, createdAt, lastActiveAt, expiresAt } =
    value
  if (
    !isId(sessionId) ||
    typeof current !== 'boolean' ||
    !isTime(createdAt) ||
    !isTime(lastActiveAt) ||
    !isTime(expiresAt)
  )
    return null
  return {
    sessionId,
    platform: isPlatform(platform) ? platform : null,
    device: optionalString(value.device),
    appVersion: optionalString(value.appVersion),
    current,
    createdAt,
    lastActiveAt,
    expiresAt,
  }
}

const parseActivitySession = (value: unknown): ActivitySession | null => {
  if (!isRecord(value) || !isId(value.sessionId)) return null
  return {
    sessionId: value.sessionId,
    platform: isPlatform(value.platform) ? value.platform : null,
    device: optionalString(value.device),
  }
}

export function parseActivityEntry(value: unknown): ActivityEntry | null {
  if (!isRecord(value)) return null
  const { id, kind, createdAt } = value
  if (
    typeof id !== 'string' ||
    !id ||
    !isActivityKind(kind) ||
    !isTime(createdAt)
  )
    return null
  return {
    id,
    kind,
    createdAt,
    method: optionalMethod(value.method),
    session: parseActivitySession(value.session),
    actor: parseActivitySession(value.actor),
    slotId: isId(value.slotId) ? value.slotId : null,
  }
}

/** The account's live sessions, newest first (`GET /accounts/v1/sessions`). */
export async function fetchAccountDevices(
  options: ActivityClientOptions
): Promise<AccountDevice[]> {
  const response = await options.request<{ sessions?: unknown }>({
    url: `${options.baseUrl}/accounts/v1/sessions`,
    method: 'GET',
    timeoutMs: ACCOUNT_TIMEOUT_MS,
    retry: { retries: 1 },
    signal: options.signal,
  })
  const sessions = response.data?.sessions
  if (!Array.isArray(sessions)) throw new Error('Malformed sessions answer')
  return sessions.flatMap((session) => parseDevice(session) ?? [])
}

/**
 * Signs another device out (`POST /accounts/v1/sessions/revoke`). Repeating it
 * can't do anything twice, so a lost answer is retried once.
 */
export async function revokeAccountDevice(
  sessionId: string,
  options: ActivityClientOptions
): Promise<void> {
  await options.request({
    url: `${options.baseUrl}/accounts/v1/sessions/revoke`,
    method: 'POST',
    json: { sessionId },
    timeoutMs: ACCOUNT_TIMEOUT_MS,
    idempotent: true,
    retry: { retries: 1 },
    signal: options.signal,
  })
}

/**
 * One page of the account's activity, newest first (`GET
 * /accounts/v1/activity`).
 */
export async function fetchAccountActivity(
  page: { before?: string | null; limit?: number },
  options: ActivityClientOptions
): Promise<ActivityPage> {
  const query = new URLSearchParams()
  if (page.limit != null) query.set('limit', String(page.limit))
  if (page.before) query.set('before', page.before)
  const search = query.toString()
  const response = await options.request<{
    activity?: unknown
    nextCursor?: unknown
  }>({
    url: `${options.baseUrl}/accounts/v1/activity${search ? `?${search}` : ''}`,
    method: 'GET',
    timeoutMs: ACCOUNT_TIMEOUT_MS,
    retry: { retries: 1 },
    signal: options.signal,
  })
  const { activity, nextCursor } = response.data ?? {}
  if (!Array.isArray(activity)) throw new Error('Malformed activity answer')
  return {
    entries: activity.flatMap((entry) => parseActivityEntry(entry) ?? []),
    nextCursor: typeof nextCursor === 'string' ? nextCursor : null,
  }
}
