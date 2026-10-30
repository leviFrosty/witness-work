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

/**
 * Client for `/accounts/v1/approval/*` (docs/passkeys-protocol.md, "Approving a
 * browser from a phone"). The browser has no account yet, so its ops are plain
 * JSON authorized by its `browserToken`; the phone's are **Bearer**, with its
 * attested session. Failures throw `HttpError`, with the server's code
 * (`not_found`, `conflict`, `bad_signature`, `forbidden`, `too_large`,
 * `rate_limited`, …) in `serverCode`.
 */

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

/** The browser: no account yet. */
export type BrowserClientOptions = PlainAccountOptions

/** The phone: its account session. */
export type PhoneClientOptions = BearerAccountOptions

/** The browser's own token for a channel. */
export type BrowserToken = { channelId: string; browserToken: string }

/** Where the browser opened the channel, as coarse as Cloudflare gives it. */
export type ApprovalLocation = {
  city?: string
  region?: string
  country?: string
}

export type ApprovalClaim = {
  expiresAt: number
  /** The browser's sealed hello. */
  hello: string
  location?: ApprovalLocation
  /** Another country or over 200 km away: a hint, not a control. */
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

/** An X25519 public key: 43 b64u characters, which decode to 32 bytes. */
const isPublicKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)

function statusView(response: AccountAnswer): ApprovalStatusView {
  const data = response.data
  if (!isStatus(data?.status)) throw unexpectedResponse(response.status)
  // A key the browser can't use is no claim: never pass it on.
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
  const location: ApprovalLocation = {
    ...(optionalString(city) && { city: city as string }),
    ...(optionalString(region) && { region: region as string }),
    ...(optionalString(country) && { country: country as string }),
  }
  return Object.keys(location).length > 0 ? location : undefined
}

// --- The browser ------------------------------------------------------------

/** Opens `channelId` with both verifiers and the sealed hello. */
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

/** The channel's status, with the phone's key once claimed. */
export async function approvalStatusAsBrowser(
  token: BrowserToken,
  options: BrowserClientOptions
): Promise<ApprovalStatusView> {
  return statusView(await sendPlainAccountOp('approval/status', token, options))
}

/** The status, and the sealed key and a ticket once `sent`. */
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

/** The key is stored: the server drops the blob. */
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

// --- The phone --------------------------------------------------------------

/** Claims the channel; answers the browser's hello and where it is. */
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

/** The sealed account key, only while `claimed`; the same key again is `ok`. */
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
