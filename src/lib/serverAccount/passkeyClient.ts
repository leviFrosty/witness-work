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

/**
 * Client for passkeys, web sign-up and web recovery (docs/passkeys-protocol.md,
 * "Routes"). Signing in and signing up need no session; step-up, creation
 * options and the list are **Bearer**; adding, wrapping and removing are Bearer
 * **and** signed by the account key, so a leaked token alone can't. Every
 * WebAuthn response is posted without its PRF output. Failures throw
 * `HttpError`; `passkeyFailureFor` sorts them.
 */

/** Bearer ops, and the account key's signature for the ones that need both. */
export type PasskeyClientOptions = BearerSignedAccountOptions

/**
 * WebAuthn's JSON options (`PublicKeyCredentialRequestOptionsJSON` or
 * `…CreationOptionsJSON`), passed to the platform as they are.
 */
export type PasskeyCeremonyOptions = { challenge: string } & Record<
  string,
  unknown
>

/**
 * WebAuthn's JSON response (`AuthenticationResponseJSON` or
 * `RegistrationResponseJSON`), `b64u` throughout.
 */
export type PasskeyResponseJSON = {
  id: string
  rawId: string
  type: 'public-key'
  response: Record<string, unknown>
  clientExtensionResults?: Record<string, unknown>
  authenticatorAttachment?: string | null
}

export type PasskeyChallenge = {
  /** Sent back with the response. */
  challengeToken: string
  options: PasskeyCeremonyOptions
}

/** What a sign-in assertion answers. */
export type PasskeySignIn = {
  accountId: string
  accountPub: string
  status: AccountStatus
  keyEpoch: number
  credentialId: string
  userHandle: string
  /** The credential's wraps for `keyEpoch`, newest first. */
  wraps: PasskeyWrap[]
  /** A browser's `passkey` ticket; absent for an Android app's origin. */
  ticket?: string
  ticketExpiresAt?: number
}

export type PasskeyPlatform = 'ios' | 'android' | 'web' | 'dev'

export type Passkey = {
  credentialId: string
  /** At least one wrap for the current key epoch. */
  canUnlock: boolean
  createdAt: number
  lastUsedAt?: number
  /** `unknown` for a platform this app version doesn't know. */
  createdPlatform: PasskeyPlatform | 'unknown'
  /** The creating device's label, sealed like a session's. */
  label?: string
  /** For a provider name; display only. */
  aaguid?: string
  backedUp: boolean
}

export type PasskeyList = { userHandle?: string; passkeys: Passkey[] }

/** A browser's sign-in ticket, from `web/recovery`. */
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

// --- Signing in -------------------------------------------------------------

/** A discoverable sign-in's challenge (`purpose: "sign-in"`), no auth. */
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

/**
 * Verifies a sign-in: the account, its key epoch, and the credential's wraps
 * (open them with `openPasskeyWraps`), and a browser's ticket.
 */
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

// --- Step-up ----------------------------------------------------------------

/** A step-up's challenge, for the session's account's passkeys. */
export async function startPasskeyStepUp(
  options: BearerAccountOptions
): Promise<PasskeyChallenge> {
  return challenge(
    await sendBearerAccountJson(
      'passkeys/challenge',
      { purpose: 'step-up' },
      options
    )
  )
}

/** Verifies a step-up; the session records `stepUpAt`. */
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

// --- Adding, wrapping, listing, removing ------------------------------------

/**
 * Creation options with the account's user handle, its name, and its passkeys
 * excluded. Mints the user handle the first time.
 */
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

/**
 * Stores a new passkey (`passkey/add`). Sent at once, without a wrap, so the
 * server knows every passkey; the wrap follows with `savePasskeyWrap`. A wrap
 * sent here carries its id and key epoch too.
 */
export async function addPasskey(
  args: {
    challengeToken: string
    response: PasskeyResponseJSON
    /** Sealed like a session's `device`. */
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

/** Saves a wrap for a credential. Repeating a `wrapId` is `ok`. */
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

/** The account's passkeys, newest first. */
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

/** Deletes a credential and its wraps; idempotent. */
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

// --- The web ----------------------------------------------------------------

/** A new account's id and creation options, once Turnstile passes. */
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

/**
 * Creates the account with its passkey, the wrap, and a web session, in one
 * request signed by the new account key (`web/signup`).
 */
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

/** A `recovery` ticket for the account a recovery key entered on the web holds. */
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

// --- Failures ---------------------------------------------------------------

/** `passkey_failed`'s `reason`; `unknown` for one this app doesn't know. */
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

/** Why a passkey, sign-up or recovery request failed, as screens explain it. */
export type PasskeyFailure =
  /** No connection, or the request timed out or was cancelled. */
  | 'offline'
  /** Accounts or web sign-up are off (`disabled`). */
  | 'unavailable'
  /** Ww-api needs a newer app version (426). */
  | 'updateRequired'
  /** This phone couldn't prove it's WitnessWork, so it has no session. */
  | 'unverified'
  /** The same, but only for now. */
  | 'verifyLater'
  /** The ceremony didn't verify; `reason` says why. */
  | 'passkeyFailed'
  /** A ticket that's malformed, expired, used, or another account's. */
  | 'ticketInvalid'
  /** Turnstile refused; `reason` is its first error code. */
  | 'turnstileFailed'
  /** A web session needs a step-up first. */
  | 'stepUpRequired'
  /** The session's account key was retired (ADR 0039). */
  | 'keyRetired'
  | 'rateLimited'
  /** 10 passkeys already (`limit`). */
  | 'limit'
  /**
   * The credential is another account's, the account exists, or the epoch
   * moved.
   */
  | 'conflict'
  | 'notFound'
  /** No account for this key: the web doesn't create one from a recovery key. */
  | 'unknownAccount'
  | 'tooLarge'
  | 'server'

export type PasskeyError = {
  failure: PasskeyFailure
  /** `passkeyFailed`'s reason, or `turnstileFailed`'s code. */
  reason: string | null
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

export function passkeyFailureFor(error: unknown): PasskeyError {
  const result = (
    failure: PasskeyFailure,
    reason: string | null = null
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
    return result(failure, typeof reason === 'string' ? reason : null)
  if (failure) return result(failure)
  return result(error.kind === 'rateLimited' ? 'rateLimited' : 'server')
}
