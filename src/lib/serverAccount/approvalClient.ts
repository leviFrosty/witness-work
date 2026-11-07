import {
  type AccountAnswer,
  type BearerAccountOptions,
  expiresAtOf,
  okOnly,
  optionalString,
  type PlainAccountOptions,
  sendBearerAccountJson,
  sendPlainAccountOp,
  unexpectedResponse,
} from '@/lib/serverAccount/client'
import { plainLine } from '@/lib/serverAccount/handoff'

const PLACE_MAX = 64

export type ApprovalStatus = 'open' | 'claimed' | 'sent' | 'done' | 'cancelled'

const STATUSES: readonly ApprovalStatus[] = [
  'open',
  'claimed',
  'sent',
  'done',
  'cancelled',
]

const isStatus = (value: unknown): value is ApprovalStatus =>
  STATUSES.includes(value as ApprovalStatus)

export type BrowserClientOptions = PlainAccountOptions

export type PhoneClientOptions = BearerAccountOptions

export type BrowserToken = { channelId: string; browserToken: string }

export type ApprovalLocation = {
  city?: string
  region?: string
  country?: string
}

export type ApprovalClaim = {
  expiresAt: number

  hello: string
  location?: ApprovalLocation

  far: boolean
}

export type ApprovalStatusView = {
  status: ApprovalStatus
  expiresAt: number
  phonePub?: string
}

export type ApprovalReceiveView = {
  status: ApprovalStatus
  key?: string
  ticket?: string
  ticketExpiresAt?: number
}

const isPublicKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)

function statusView(response: AccountAnswer): ApprovalStatusView {
  const data = response.data
  if (!isStatus(data?.status)) throw unexpectedResponse(response.status)

  const phonePub = data.phonePub ?? undefined
  if (phonePub !== undefined && !isPublicKey(phonePub))
    throw unexpectedResponse(response.status)
  return {
    status: data.status,
    expiresAt: expiresAtOf(response),
    ...(phonePub !== undefined && { phonePub }),
  }
}

function locationOf(value: unknown): ApprovalLocation | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { city, region, country } = value as Record<string, unknown>
  const place = (field: unknown) =>
    optionalString(field) ? plainLine(field as string, PLACE_MAX) : ''
  const location: ApprovalLocation = {
    ...(place(city) && { city: place(city) }),
    ...(place(region) && { region: place(region) }),
    ...(place(country) && { country: place(country) }),
  }
  return Object.keys(location).length > 0 ? location : undefined
}

export async function openApproval(
  args: {
    channelId: string
    verifier: string
    browserVerifier: string
    hello: string
  },
  options: BrowserClientOptions
): Promise<{ expiresAt: number }> {
  return {
    expiresAt: expiresAtOf(
      await sendPlainAccountOp('approval/open', args, options)
    ),
  }
}

export async function approvalStatusAsBrowser(
  token: BrowserToken,
  options: BrowserClientOptions
): Promise<ApprovalStatusView> {
  return statusView(await sendPlainAccountOp('approval/status', token, options))
}

export async function receiveApproval(
  token: BrowserToken,
  options: BrowserClientOptions
): Promise<ApprovalReceiveView> {
  const response = await sendPlainAccountOp('approval/receive', token, options)
  const data = response.data
  if (data?.ok !== true || !isStatus(data.status))
    throw unexpectedResponse(response.status)
  const key = optionalString(data.key)
  const ticket = optionalString(data.ticket)
  const ticketExpiresAt = data.ticketExpiresAt
  return {
    status: data.status,
    ...(key && { key }),
    ...(ticket &&
      typeof ticketExpiresAt === 'number' &&
      ticketExpiresAt > 0 && { ticket, ticketExpiresAt }),
  }
}

export async function finishApproval(
  token: BrowserToken,
  options: BrowserClientOptions
): Promise<void> {
  okOnly(await sendPlainAccountOp('approval/done', token, options))
}

export async function cancelApprovalAsBrowser(
  token: BrowserToken,
  options: BrowserClientOptions
): Promise<void> {
  okOnly(await sendPlainAccountOp('approval/cancel', token, options))
}

export async function claimApproval(
  args: { channelId: string; claimToken: string; phonePub: string },
  options: PhoneClientOptions
): Promise<ApprovalClaim> {
  const response = await sendBearerAccountJson('approval/claim', args, options)
  const hello = optionalString(response.data?.hello)
  if (!hello) throw unexpectedResponse(response.status)
  const location = locationOf(response.data?.location)
  return {
    expiresAt: expiresAtOf(response),
    hello,
    ...(location && { location }),
    far: response.data?.far === true,
  }
}

export async function approvalStatusAsPhone(
  channelId: string,
  options: PhoneClientOptions
): Promise<ApprovalStatusView> {
  return statusView(
    await sendBearerAccountJson('approval/status', { channelId }, options)
  )
}

export async function sendApprovalKey(
  args: { channelId: string; key: string },
  options: PhoneClientOptions
): Promise<void> {
  okOnly(await sendBearerAccountJson('approval/send', args, options))
}

export async function cancelApprovalAsPhone(
  channelId: string,
  options: PhoneClientOptions
): Promise<void> {
  okOnly(await sendBearerAccountJson('approval/cancel', { channelId }, options))
}
