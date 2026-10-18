import { HttpError, request } from '@/lib/http/request'
import {
  ACCOUNT_TIMEOUT_MS,
  type BearerAccountOptions,
  sendBearerAccountOp,
} from '@/lib/serverAccount/client'

/**
 * Client for `/accounts/v1/handoff/*` (docs/accounts-protocol.md, "Handoff").
 * The old phone's ops are **Bearer**, with its account session; the new phone's
 * are plain JSON authorized by the claim token, since it has no session until
 * it has the key. Failures throw `HttpError`, with the server's code
 * (`not_found`, `conflict`, `bad_signature`, `forbidden`, `too_large`,
 * `unknown_account`, `disabled`, `rate_limited`, …) in `serverCode`.
 */

export type HandoffStatus = 'open' | 'claimed' | 'sent' | 'done' | 'cancelled'

const STATUSES: readonly HandoffStatus[] = [
  'open',
  'claimed',
  'sent',
  'done',
  'cancelled',
]

const isStatus = (value: unknown): value is HandoffStatus =>
  STATUSES.includes(value as HandoffStatus)

/** The old phone: its account session. */
export type OfferClientOptions = BearerAccountOptions

/** The new phone: no account yet, so nothing to sign with. */
export type ClaimClientOptions = {
  baseUrl: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export type HandoffStatusView = {
  status: HandoffStatus
  expiresAt: number
  claimPub?: string
  hello?: string
}

export type HandoffReceiveView = { status: HandoffStatus; key?: string }

const unexpected = (status: number) =>
  new HttpError('server', status, 'unexpected_response')

type Body = Record<string, unknown> | null

function okOnly(response: { status: number; data: Body }) {
  if (response.data?.ok !== true) throw unexpected(response.status)
}

function expiresAt(response: { status: number; data: Body }): number {
  const value = response.data?.expiresAt
  if (response.data?.ok !== true || typeof value !== 'number' || value <= 0)
    throw unexpected(response.status)
  return value
}

const optionalString = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : undefined

async function plain(
  op: 'handoff/claim' | 'handoff/receive' | 'handoff/done' | 'handoff/cancel',
  json: Record<string, string>,
  options: ClaimClientOptions
) {
  const response = await request<Body>({
    url: `${options.baseUrl}/accounts/v1/${op}`,
    json,
    timeoutMs: ACCOUNT_TIMEOUT_MS,
    signal: options.signal,
    fetchImpl: options.fetchImpl,
  })
  return { status: response.status, data: response.data ?? null }
}

async function bearer(
  op: 'handoff/open' | 'handoff/status' | 'handoff/send' | 'handoff/cancel',
  fields: Record<string, string>,
  options: OfferClientOptions
) {
  const response = await sendBearerAccountOp<Body>(op, fields, options)
  return { status: response.status, data: response.data ?? null }
}

/** Old phone: opens `channelId` with the claim token's verifier. */
export async function openHandoff(
  { channelId, verifier }: { channelId: string; verifier: string },
  options: OfferClientOptions
): Promise<{ expiresAt: number }> {
  const response = await bearer(
    'handoff/open',
    { channelId, verifier },
    options
  )
  return { expiresAt: expiresAt(response) }
}

/** Old phone: the channel's status, with the claim once there is one. */
export async function handoffStatus(
  channelId: string,
  options: OfferClientOptions
): Promise<HandoffStatusView> {
  const response = await bearer('handoff/status', { channelId }, options)
  const data = response.data
  if (!isStatus(data?.status)) throw unexpected(response.status)
  return {
    status: data.status,
    expiresAt: expiresAt(response),
    claimPub: optionalString(data.claimPub),
    hello: optionalString(data.hello),
  }
}

/** Old phone: the sealed account key, only while `claimed`. */
export async function sendHandoffKey(
  { channelId, key }: { channelId: string; key: string },
  options: OfferClientOptions
): Promise<void> {
  okOnly(await bearer('handoff/send', { channelId, key }, options))
}

/** Old phone: ends the channel. A no-op once `done`. */
export async function cancelHandoffAsOffer(
  channelId: string,
  options: OfferClientOptions
): Promise<void> {
  okOnly(await bearer('handoff/cancel', { channelId }, options))
}

/** New phone: claims the channel with its key and sealed hello. */
export async function claimHandoff(
  args: {
    channelId: string
    claimToken: string
    claimPub: string
    hello: string
  },
  options: ClaimClientOptions
): Promise<{ expiresAt: number }> {
  return { expiresAt: expiresAt(await plain('handoff/claim', args, options)) }
}

/** New phone: the status, and the sealed key once it's `sent`. */
export async function receiveHandoff(
  args: { channelId: string; claimToken: string },
  options: ClaimClientOptions
): Promise<HandoffReceiveView> {
  const response = await plain('handoff/receive', args, options)
  const data = response.data
  if (data?.ok !== true || !isStatus(data.status))
    throw unexpected(response.status)
  return { status: data.status, key: optionalString(data.key) }
}

/** New phone: it has the key; the server drops the blobs. */
export async function finishHandoff(
  args: { channelId: string; claimToken: string },
  options: ClaimClientOptions
): Promise<void> {
  okOnly(await plain('handoff/done', args, options))
}

/** New phone: ends the channel. A no-op once `done`. */
export async function cancelHandoffAsClaim(
  args: { channelId: string; claimToken: string },
  options: ClaimClientOptions
): Promise<void> {
  okOnly(await plain('handoff/cancel', args, options))
}
