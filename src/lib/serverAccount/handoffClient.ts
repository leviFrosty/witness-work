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

export type OfferClientOptions = BearerAccountOptions

export type ClaimClientOptions = PlainAccountOptions

export type HandoffStatusView = {
  status: HandoffStatus
  expiresAt: number
  claimPub?: string
  hello?: string
}

export type HandoffReceiveView = { status: HandoffStatus; key?: string }

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

export async function sendHandoffKey(
  { channelId, key }: { channelId: string; key: string },
  options: OfferClientOptions
): Promise<void> {
  okOnly(
    await sendBearerAccountJson('handoff/send', { channelId, key }, options)
  )
}

export async function cancelHandoffAsOffer(
  channelId: string,
  options: OfferClientOptions
): Promise<void> {
  okOnly(await sendBearerAccountJson('handoff/cancel', { channelId }, options))
}

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

export async function finishHandoff(
  args: { channelId: string; claimToken: string },
  options: ClaimClientOptions
): Promise<void> {
  okOnly(await sendPlainAccountOp('handoff/done', args, options))
}

export async function cancelHandoffAsClaim(
  args: { channelId: string; claimToken: string },
  options: ClaimClientOptions
): Promise<void> {
  okOnly(await sendPlainAccountOp('handoff/cancel', args, options))
}
