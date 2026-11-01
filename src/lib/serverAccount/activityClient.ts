import type { HttpResponse, RequestOptions } from '@/lib/http/request'
import { RELAY_ID_PATTERN } from '@/lib/bytes'
import { ACCOUNT_TIMEOUT_MS } from '@/lib/serverAccount/client'

export type AuthorizedRequest = <T>(
  options: RequestOptions
) => Promise<HttpResponse<T>>

export type ActivityClientOptions = {
  baseUrl: string
  request: AuthorizedRequest
  signal?: AbortSignal
}

export type SessionPlatform = 'ios' | 'android' | 'dev'

const isPlatform = (value: unknown): value is SessionPlatform =>
  value === 'ios' || value === 'android' || value === 'dev'

export type AccountDevice = {
  sessionId: string
  platform: SessionPlatform

  device: string | null

  current: boolean
  createdAt: number
  lastActiveAt: number
  expiresAt: number
}

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
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

const isActivityKind = (value: unknown): value is ActivityKind =>
  (ACTIVITY_KINDS as readonly unknown[]).includes(value)

export type ActivitySession = {
  sessionId: string
  platform: SessionPlatform | null
  device: string | null
}

export type ActivityEntry = {
  id: string
  kind: ActivityKind
  createdAt: number

  session: ActivitySession | null

  actor: ActivitySession | null

  slotId: string | null
}

export type ActivityPage = {
  entries: ActivityEntry[]

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
    !isPlatform(platform) ||
    typeof current !== 'boolean' ||
    !isTime(createdAt) ||
    !isTime(lastActiveAt) ||
    !isTime(expiresAt)
  )
    return null
  return {
    sessionId,
    platform,
    device: optionalString(value.device),
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
  if (typeof id !== 'string' || !isActivityKind(kind) || !isTime(createdAt))
    return null
  return {
    id,
    kind,
    createdAt,
    session: parseActivitySession(value.session),
    actor: parseActivitySession(value.actor),
    slotId: isId(value.slotId) ? value.slotId : null,
  }
}

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
