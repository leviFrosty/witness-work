import {
  type BearerAccountOptions,
  expiresAtOf,
  okOnly,
  optionalString,
  type PlainAccountOptions,
  sendBearerAccountJson,
  sendPlainAccountOp,
  unexpectedResponse,
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
export type ClaimClientOptions = PlainAccountOptions

export type HandoffStatusView = {
  status: HandoffStatus
  expiresAt: number
  claimPub?: string
  hello?: string
}

export type HandoffReceiveView = { status: HandoffStatus; key?: string }

/** Old phone: opens `channelId` with the claim token's verifier. */
export async function openHandoff(
  { channelId, verifier }: { channelId: string; verifier: string },
  options: OfferClientOptions
): Promise<{ expiresAt: number }> {
  const response = await sendBearerAccountJson(
    'handoff/open',
    { channelId, verifier },
    options
  )
  return { expiresAt: expiresAtOf(response) }
}

/** Old phone: the channel's status, with the claim once there is one. */
export async function handoffStatus(
  channelId: string,
  options: OfferClientOptions
): Promise<HandoffStatusView> {
  const response = await sendBearerAccountJson(
    'handoff/status',
    { channelId },
    options
  )
  const data = response.data
  if (!isStatus(data?.status)) throw unexpectedResponse(response.status)
  return {
    status: data.status,
    expiresAt: expiresAtOf(response),
    claimPub: optionalString(data.claimPub),
    hello: optionalString(data.hello),
  }
}

/** Old phone: the sealed account key, only while `claimed`. */
export async function sendHandoffKey(
  { channelId, key }: { channelId: string; key: string },
  options: OfferClientOptions
): Promise<void> {
  okOnly(
    await sendBearerAccountJson('handoff/send', { channelId, key }, options)
  )
}

/** Old phone: ends the channel. A no-op once `done`. */
export async function cancelHandoffAsOffer(
  channelId: string,
  options: OfferClientOptions
): Promise<void> {
  okOnly(await sendBearerAccountJson('handoff/cancel', { channelId }, options))
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
  return {
    expiresAt: expiresAtOf(
      await sendPlainAccountOp('handoff/claim', args, options)
    ),
  }
}

/** New phone: the status, and the sealed key once it's `sent`. */
export async function receiveHandoff(
  args: { channelId: string; claimToken: string },
  options: ClaimClientOptions
): Promise<HandoffReceiveView> {
  const response = await sendPlainAccountOp('handoff/receive', args, options)
  const data = response.data
  if (data?.ok !== true || !isStatus(data.status))
    throw unexpectedResponse(response.status)
  return { status: data.status, key: optionalString(data.key) }
}

/** New phone: it has the key; the server drops the blobs. */
export async function finishHandoff(
  args: { channelId: string; claimToken: string },
  options: ClaimClientOptions
): Promise<void> {
  okOnly(await sendPlainAccountOp('handoff/done', args, options))
}

/** New phone: ends the channel. A no-op once `done`. */
export async function cancelHandoffAsClaim(
  args: { channelId: string; claimToken: string },
  options: ClaimClientOptions
): Promise<void> {
  okOnly(await sendPlainAccountOp('handoff/cancel', args, options))
}
