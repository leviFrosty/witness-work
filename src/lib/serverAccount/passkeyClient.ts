import { RELAY_ID_PATTERN } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import {
  type AccountAnswer,
  type AccountStatus,
  type BearerAccountOptions,
  type BearerSignedAccountOptions,
  isAccountStatus,
  okOnly,
  type PlainAccountOptions,
  type SignedAccountOp,
  type SignedAccountOptions,
  sendBearerAccountJson,
  sendBearerSignedAccountOp,
  sendPlainAccountOp,
  sendSignedAccountOp,
  unexpectedResponse,
} from '@/lib/serverAccount/client'
import { SESSION_CAPABILITIES } from '@/lib/serverAccount/capabilities'
import {
  type PasskeyWrap,
  withoutPrfResults,
} from '@/lib/serverAccount/passkeys'
import { sessionFailureFor } from '@/lib/serverAccount/session'
import {
  isSessionAppVersion,
  type OpenedSession,
  parseOpenedSession,
} from '@/lib/serverAccount/sessionClient'

export type PasskeyClientOptions = BearerSignedAccountOptions

export type PasskeyCeremonyOptions = { challenge: string } & Record<
  string,
  unknown
>

export type PasskeyResponseJSON = {
  id: string
  rawId: string
  type: 'public-key'
  response: Record<string, unknown>
  clientExtensionResults?: Record<string, unknown>
  authenticatorAttachment?: string | null
}

export type PasskeyChallenge = {
  challengeToken: string
  options: PasskeyCeremonyOptions
}

export type PasskeySignIn = {
  accountId: string
  accountPub: string
  status: AccountStatus
  keyEpoch: number
  credentialId: string
  userHandle: string

  wraps: PasskeyWrap[]

  ticket?: string
  ticketExpiresAt?: number
}

export type PasskeyPlatform = 'ios' | 'android' | 'web' | 'dev'

export type Passkey = {
  credentialId: string

  canUnlock: boolean
  createdAt: number
  lastUsedAt?: number

  createdPlatform: PasskeyPlatform | 'unknown'

  label?: string

  aaguid?: string
  backedUp: boolean
}

export type PasskeyList = { userHandle?: string; passkeys: Passkey[] }

export type WebTicket = {
  accountId: string
  ticket: string
  ticketExpiresAt: number
}

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const isEpoch = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const PLATFORMS: readonly PasskeyPlatform[] = ['ios', 'android', 'web', 'dev']

async function signed(
  op: SignedAccountOp,
  fields: Record<string, unknown>,
  options: SignedAccountOptions
): Promise<AccountAnswer> {
  const response = await sendSignedAccountOp<AccountAnswer['data']>(
    op,
    fields,
    options
  )
  return { status: response.status, data: response.data ?? null }
}

function challenge(response: AccountAnswer): PasskeyChallenge {
  const { challengeToken, options } = response.data ?? {}
  if (
    response.data?.ok !== true ||
    !isString(challengeToken) ||
    typeof options !== 'object' ||
    options === null ||
    !isString((options as { challenge?: unknown }).challenge)
  )
    throw unexpectedResponse(response.status)
  return { challengeToken, options: options as PasskeyCeremonyOptions }
}

function wrapsOf(value: unknown): PasskeyWrap[] | null {
  if (!Array.isArray(value)) return null
  const wraps: PasskeyWrap[] = []
  for (const entry of value) {
    const { wrapId, wrap, keyEpoch } = (entry ?? {}) as Record<string, unknown>
    if (!isString(wrapId) || !isString(wrap) || !isEpoch(keyEpoch)) return null
    wraps.push({ wrapId, wrap, keyEpoch })
  }
  return wraps
}

function ticketOf(data: AccountAnswer['data']) {
  const { ticket, ticketExpiresAt } = data ?? {}
  return isString(ticket) && isTime(ticketExpiresAt)
    ? { ticket, ticketExpiresAt }
    : null
}

const posted = (response: PasskeyResponseJSON) => withoutPrfResults(response)

export async function startPasskeySignIn(
  { rpId }: { rpId?: string },
  options: PlainAccountOptions
): Promise<PasskeyChallenge> {
  return challenge(
    await sendPlainAccountOp(
      'passkeys/challenge',
      { purpose: 'sign-in', ...(rpId && { rpId }) },
      options
    )
  )
}

export async function finishPasskeySignIn(
  args: { challengeToken: string; response: PasskeyResponseJSON },
  options: PlainAccountOptions
): Promise<PasskeySignIn> {
  const response = await sendPlainAccountOp(
    'passkeys/assert',
    { challengeToken: args.challengeToken, response: posted(args.response) },
    options
  )
  const data = response.data
  const { accountId, accountPub, status, keyEpoch, credentialId, userHandle } =
    data ?? {}
  const wraps = wrapsOf(data?.wraps)
  if (
    data?.ok !== true ||
    typeof accountId !== 'string' ||
    !RELAY_ID_PATTERN.test(accountId) ||
    !isString(accountPub) ||
    !isAccountStatus(status) ||
    !isEpoch(keyEpoch) ||
    !isString(credentialId) ||
    !isString(userHandle) ||
    !wraps
  )
    throw unexpectedResponse(response.status)
  return {
    accountId,
    accountPub,
    status,
    keyEpoch,
    credentialId,
    userHandle,
    wraps,
    ...ticketOf(data),
  }
}

export async function startPasskeyStepUp(
  { rpId }: { rpId?: string },
  options: BearerAccountOptions
): Promise<PasskeyChallenge> {
  return challenge(
    await sendBearerAccountJson(
      'passkeys/challenge',
      { purpose: 'step-up', ...(rpId && { rpId }) },
      options
    )
  )
}

export async function finishPasskeyStepUp(
  args: { challengeToken: string; response: PasskeyResponseJSON },
  options: BearerAccountOptions
): Promise<{ credentialId: string; stepUpAt: number }> {
  const response = await sendBearerAccountJson(
    'passkeys/assert',
    { challengeToken: args.challengeToken, response: posted(args.response) },
    options
  )
  const { credentialId, stepUpAt } = response.data ?? {}
  if (
    response.data?.ok !== true ||
    !isString(credentialId) ||
    !isTime(stepUpAt)
  )
    throw unexpectedResponse(response.status)
  return { credentialId, stepUpAt }
}

export async function passkeyRegistrationOptions(
  { rpId }: { rpId?: string },
  options: BearerAccountOptions
): Promise<PasskeyChallenge & { userHandle: string }> {
  const response = await sendBearerAccountJson(
    'passkeys/register/options',
    rpId ? { rpId } : {},
    options
  )
  const userHandle = response.data?.userHandle
  if (!isString(userHandle)) throw unexpectedResponse(response.status)
  return { ...challenge(response), userHandle }
}

export async function addPasskey(
  args: {
    challengeToken: string
    response: PasskeyResponseJSON

    label?: string
    wrap?: PasskeyWrap
  },
  options: PasskeyClientOptions
): Promise<{ credentialId: string }> {
  const response = await sendBearerSignedAccountOp(
    'passkey/add',
    {
      challengeToken: args.challengeToken,
      response: posted(args.response),
      ...(args.label !== undefined && { label: args.label }),
      ...(args.wrap && {
        wrapId: args.wrap.wrapId,
        keyEpoch: args.wrap.keyEpoch,
        wrap: args.wrap.wrap,
      }),
    },
    options
  )
  const credentialId = response.data?.credentialId
  if (response.data?.ok !== true || !isString(credentialId))
    throw unexpectedResponse(response.status)
  return { credentialId }
}

export async function savePasskeyWrap(
  args: {
    credentialId: string
    wrapId: string
    keyEpoch: number
    wrap: string
  },
  options: PasskeyClientOptions
): Promise<void> {
  okOnly(
    await sendBearerSignedAccountOp('passkey/wrap', args, options, {
      idempotent: true,
    })
  )
}

export async function listPasskeys(
  options: BearerAccountOptions
): Promise<PasskeyList> {
  const response = await sendBearerAccountJson('passkeys', null, options, {
    idempotent: true,
  })
  const data = response.data
  if (data?.ok !== true || !Array.isArray(data.passkeys))
    throw unexpectedResponse(response.status)
  const passkeys = data.passkeys.map((entry: unknown): Passkey => {
    const value = (entry ?? {}) as Record<string, unknown>
    const {
      credentialId,
      canUnlock,
      createdAt,
      lastUsedAt,
      createdPlatform,
      label,
      aaguid,
      backedUp,
    } = value
    if (
      !isString(credentialId) ||
      typeof canUnlock !== 'boolean' ||
      !isTime(createdAt) ||
      typeof backedUp !== 'boolean'
    )
      throw unexpectedResponse(response.status)
    return {
      credentialId,
      canUnlock,
      createdAt,
      ...(isTime(lastUsedAt) && { lastUsedAt }),
      createdPlatform: PLATFORMS.includes(createdPlatform as PasskeyPlatform)
        ? (createdPlatform as PasskeyPlatform)
        : 'unknown',
      ...(isString(label) && { label }),
      ...(isString(aaguid) && { aaguid }),
      backedUp,
    }
  })
  return {
    ...(isString(data.userHandle) && { userHandle: data.userHandle }),
    passkeys,
  }
}

export async function removePasskey(
  credentialId: string,
  options: PasskeyClientOptions
): Promise<void> {
  okOnly(
    await sendBearerSignedAccountOp(
      'passkey/remove',
      { credentialId },
      options,
      { idempotent: true }
    )
  )
}

export async function webSignupOptions(
  { turnstileToken, rpId }: { turnstileToken: string; rpId?: string },
  options: PlainAccountOptions
): Promise<PasskeyChallenge & { accountId: string; userHandle: string }> {
  const response = await sendPlainAccountOp(
    'web/signup/options',
    { turnstileToken, ...(rpId && { rpId }) },
    options
  )
  const { accountId, userHandle } = response.data ?? {}
  if (
    typeof accountId !== 'string' ||
    !RELAY_ID_PATTERN.test(accountId) ||
    !isString(userHandle)
  )
    throw unexpectedResponse(response.status)
  return { ...challenge(response), accountId, userHandle }
}

export async function webSignup(
  args: {
    challengeToken: string
    response: PasskeyResponseJSON
    wrapId?: string
    wrap?: string
    label?: string
    device?: string
    appVersion?: string
  },
  options: SignedAccountOptions
): Promise<OpenedSession & { credentialId: string }> {
  const { response: credential, appVersion, ...rest } = args
  const fields = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined)
  )
  if (isSessionAppVersion(appVersion)) fields.appVersion = appVersion
  const response = await signed(
    'web/signup',
    {
      ...fields,
      capabilities: SESSION_CAPABILITIES,
      response: posted(credential),
    },
    options
  )
  const session = parseOpenedSession(response.data, response.status)
  const credentialId = response.data?.credentialId
  if (!isString(credentialId)) throw unexpectedResponse(response.status)
  return { ...session, credentialId }
}

export async function webRecovery(
  { turnstileToken }: { turnstileToken: string },
  options: SignedAccountOptions
): Promise<WebTicket> {
  const response = await signed('web/recovery', { turnstileToken }, options)
  const accountId = response.data?.accountId
  const ticket = ticketOf(response.data)
  if (
    response.data?.ok !== true ||
    typeof accountId !== 'string' ||
    !RELAY_ID_PATTERN.test(accountId) ||
    !ticket
  )
    throw unexpectedResponse(response.status)
  return { accountId, ...ticket }
}

export type PasskeyFailedReason =
  | 'challenge'
  | 'unknown_credential'
  | 'user_handle'
  | 'origin'
  | 'rp_id'
  | 'user_verification'
  | 'signature'
  | 'counter'
  | 'registration'
  | 'unknown'

const FAILED_REASONS: readonly PasskeyFailedReason[] = [
  'challenge',
  'unknown_credential',
  'user_handle',
  'origin',
  'rp_id',
  'user_verification',
  'signature',
  'counter',
  'registration',
]

export type PasskeyFailure =
  | 'offline'
  | 'unavailable'
  | 'updateRequired'
  | 'unverified'
  | 'verifyLater'
  | 'passkeyFailed'
  | 'ticketInvalid'
  | 'turnstileFailed'
  | 'stepUpRequired'
  | 'keyRetired'
  | 'rateLimited'
  | 'limit'
  | 'conflict'
  | 'notFound'
  | 'unknownAccount'
  | 'tooLarge'
  | 'server'

export type PasskeyError = {
  failure: PasskeyFailure

  reason: PasskeyErrorReason | null
  retryAfterMs: number | null
}

const CODES: Record<string, PasskeyFailure> = {
  disabled: 'unavailable',
  passkey_failed: 'passkeyFailed',
  ticket_invalid: 'ticketInvalid',
  turnstile_failed: 'turnstileFailed',
  step_up_required: 'stepUpRequired',
  key_retired: 'keyRetired',
  rate_limited: 'rateLimited',
  limit: 'limit',
  conflict: 'conflict',
  not_found: 'notFound',
  unknown_account: 'unknownAccount',
  too_large: 'tooLarge',
}

const TURNSTILE_REASONS = [
  'missing-input-secret',
  'invalid-input-secret',
  'missing-input-response',
  'invalid-input-response',
  'invalid-widget-id',
  'invalid-parsed-secret',
  'bad-request',
  'timeout-or-duplicate',
  'internal-error',
  'action-mismatch',
  'hostname-mismatch',
  'unknown',
] as const

export type PasskeyErrorReason =
  | PasskeyFailedReason
  | 'unknown'
  | (typeof TURNSTILE_REASONS)[number]
  | 'other'

export function passkeyFailureFor(error: unknown): PasskeyError {
  const result = (
    failure: PasskeyFailure,
    reason: PasskeyErrorReason | null = null
  ): PasskeyError => ({
    failure,
    reason,
    retryAfterMs: error instanceof HttpError ? error.retryAfterMs : null,
  })
  const shared = sessionFailureFor(error)
  if (shared) return result(shared)
  if (!(error instanceof HttpError)) return result('server')
  const failure = error.serverCode ? CODES[error.serverCode] : undefined
  const reason = (error.body as { reason?: unknown } | null)?.reason
  if (failure === 'passkeyFailed')
    return result(
      failure,
      FAILED_REASONS.find((known) => known === reason) ?? 'unknown'
    )
  if (failure === 'turnstileFailed')
    return result(
      failure,
      typeof reason === 'string'
        ? (TURNSTILE_REASONS.find((known) => known === reason) ?? 'other')
        : null
    )
  if (failure) return result(failure)
  return result(error.kind === 'rateLimited' ? 'rateLimited' : 'server')
}
