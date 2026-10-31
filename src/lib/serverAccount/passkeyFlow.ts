import { toB64u } from '@/lib/bytes'
import type { DeviceOwnerCheck } from '@/lib/deviceOwner'
import { PasskeyError } from '@/lib/passkeys/errors'
import type {
  CreatedPasskey,
  PasskeyAssertion,
  PasskeySupport,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'
import { HttpError } from '@/lib/http/request'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  type Passkey,
  type PasskeyChallenge,
  passkeyFailureFor,
} from '@/lib/serverAccount/passkeyClient'
import {
  newPasskeyWrapId,
  type PasskeyWrap,
  wrapAccountKey,
} from '@/lib/serverAccount/passkeys'

/**
 * Adding a passkey on a phone, letting a Sign-in-only one unlock, and removing
 * one (docs/passkeys-protocol.md, "Adding a passkey" and "Passkeys on phones").
 * Every step's failure ends in an outcome the screen can explain; nothing here
 * throws. The ceremonies and the server are passed in, so tests run it with the
 * native module mocked and the interop test with a software passkey.
 */

/** At most this many passkeys per account (`limit` past it). */
export const PASSKEYS_MAX = 10

/** PRF output that can seal the account key. */
const PRF_OUTPUT_BYTES = 32

/** The server's half, bound to this device's account session. */
export type PasskeyServer = {
  registrationOptions: () => Promise<PasskeyChallenge & { userHandle: string }>
  add: (args: {
    challengeToken: string
    response: CreatedPasskey['response']
    label?: string
  }) => Promise<{ credentialId: string }>
  wrap: (args: PasskeyWrap & { credentialId: string }) => Promise<void>
  remove: (credentialId: string) => Promise<void>
  /** The account's id, current key and key epoch (`GET /account`). */
  account: () => Promise<{
    accountId: string
    accountPub: string
    keyEpoch: number
  }>
}

/** `@/lib/passkeys`' create and get: PRF evaluated, and kept off the response. */
export type PasskeyCeremonies = {
  create: (
    options: PublicKeyCredentialCreationOptionsJSON
  ) => Promise<CreatedPasskey>
  get: (
    options: PublicKeyCredentialRequestOptionsJSON
  ) => Promise<PasskeyAssertion>
}

export type PasskeyFlowDeps = {
  server: PasskeyServer
  ceremonies: PasskeyCeremonies
  /** Face ID, Touch ID, fingerprint or passcode (`confirmDeviceOwner`). */
  confirmOwner: () => Promise<DeviceOwnerCheck>
  accountKey: Uint8Array
  /** The RP ID this build's passkeys are for. */
  rpId: string
  randomBytes: (length: number) => Uint8Array
  /** This device's label, sealed like a session's. */
  label?: () => string | undefined
  /** Each error that ended a step, for logs: the platform's own message. */
  onError?: (step: PasskeyFlowStep, error: unknown) => void
}

/** Why an action failed, as screens explain it and analytics records it. */
export type PasskeyFlowFailure =
  /** Face ID, Touch ID or the passcode didn't confirm the owner. */
  | 'owner_failed'
  /** No passkeys here: an old OS, no provider, or no screen lock. */
  | 'not_supported'
  /** The app isn't associated with the passkey domain yet. */
  | 'domain_not_associated'
  /** The password manager already holds one of this account's passkeys. */
  | 'already_registered'
  /** A passkey to let unlock isn't on this device or its providers. */
  | 'no_credentials'
  /** 10 passkeys already. */
  | 'limit'
  | 'offline'
  | 'timeout'
  | 'update_required'
  /** No session: this phone can't be verified, for now or for good. */
  | 'unverified'
  | 'unavailable'
  | 'rate_limited'
  /** The passkey is another account's. */
  | 'conflict'
  | 'failed'

/** Why a passkey was added but can only sign in. */
export type SignInOnlyReason =
  /** The password manager gave no PRF output, or a malformed one. */
  | 'no_prf'
  /** The User cancelled the sign-in that confirms unlocking. */
  | 'cancelled'
  /** The account key changed meanwhile, so this device's can't be saved. */
  | 'key_changed'
  /** Saving the wrap didn't get through. Let It Unlock tries again. */
  | 'not_saved'

/** Which step a failure or cancel happened at, for analytics. */
export type PasskeyFlowStep =
  | 'owner'
  | 'options'
  | 'create'
  | 'save'
  | 'get'
  | 'remove'

export type PasskeyAddResult =
  | { status: 'added'; credentialId: string; canUnlock: true }
  | {
      status: 'added'
      credentialId: string
      canUnlock: false
      signInOnly: SignInOnlyReason
    }
  | { status: 'cancelled'; step: PasskeyFlowStep }
  | { status: 'failed'; step: PasskeyFlowStep; reason: PasskeyFlowFailure }

export type PasskeyUnlockResult =
  | { status: 'unlocks' }
  | { status: 'signInOnly'; signInOnly: SignInOnlyReason }
  | { status: 'cancelled'; step: PasskeyFlowStep }
  | { status: 'failed'; step: PasskeyFlowStep; reason: PasskeyFlowFailure }

export type PasskeyRemoveResult =
  | { status: 'removed' }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: PasskeyFlowFailure }

const NATIVE: Record<PasskeyError['code'], PasskeyFlowFailure | 'cancelled'> = {
  cancelled: 'cancelled',
  not_supported: 'not_supported',
  no_credentials: 'no_credentials',
  timeout: 'timeout',
  domain_not_associated: 'domain_not_associated',
  already_registered: 'already_registered',
  failed: 'failed',
}

const SERVER: Partial<
  Record<ReturnType<typeof passkeyFailureFor>['failure'], PasskeyFlowFailure>
> = {
  offline: 'offline',
  unavailable: 'unavailable',
  updateRequired: 'update_required',
  unverified: 'unverified',
  verifyLater: 'unverified',
  rateLimited: 'rate_limited',
  limit: 'limit',
  conflict: 'conflict',
}

/** A ceremony's or a request's error as a failure, or a cancel. */
export function passkeyFlowFailure(
  error: unknown
): PasskeyFlowFailure | 'cancelled' {
  if (error instanceof PasskeyError) return NATIVE[error.code] ?? 'failed'
  return SERVER[passkeyFailureFor(error).failure] ?? 'failed'
}

const isConflict = (error: unknown) =>
  error instanceof HttpError && error.serverCode === 'conflict'

/** A get for one credential, with a challenge of its own. */
function unlockRequest(
  deps: PasskeyFlowDeps,
  credentialId: string
): PublicKeyCredentialRequestOptionsJSON {
  return {
    rpId: deps.rpId,
    challenge: toB64u(deps.randomBytes(32)),
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
    userVerification: 'required',
    timeout: 300_000,
  }
}

/**
 * Seals the account key under the PRF output and saves it. A `conflict` means
 * the key epoch moved: read the account again and, while its key is still this
 * device's, try once more at the new epoch.
 */
async function saveWrap(
  deps: PasskeyFlowDeps,
  credentialId: string,
  prfOutput: Uint8Array
): Promise<'saved' | SignInOnlyReason> {
  const accountPub = deriveAccountSigningKey(deps.accountKey).publicKey
  let lastEpoch: number | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    let account: Awaited<ReturnType<PasskeyServer['account']>>
    try {
      account = await deps.server.account()
    } catch {
      return 'not_saved'
    }
    if (account.accountPub !== accountPub) return 'key_changed'
    // A conflict again at the same epoch isn't a key change.
    if (account.keyEpoch === lastEpoch) return 'not_saved'
    lastEpoch = account.keyEpoch
    const wrap = wrapAccountKey(
      {
        prfOutput,
        accountKey: deps.accountKey,
        accountId: account.accountId,
        credentialId,
        keyEpoch: account.keyEpoch,
      },
      deps.randomBytes(24)
    )
    try {
      await deps.server.wrap({
        credentialId,
        wrapId: newPasskeyWrapId(deps.randomBytes),
        keyEpoch: account.keyEpoch,
        wrap,
      })
      return 'saved'
    } catch (error) {
      if (!isConflict(error)) return 'not_saved'
    }
  }
  return 'key_changed'
}

/** The confirming sign-in, then the wrap. */
async function unlockWith(
  deps: PasskeyFlowDeps,
  credentialId: string
): Promise<
  | { status: 'saved' }
  | { status: 'signInOnly'; signInOnly: SignInOnlyReason }
  | { status: 'failed'; reason: PasskeyFlowFailure }
> {
  let assertion: PasskeyAssertion
  try {
    assertion = await deps.ceremonies.get(unlockRequest(deps, credentialId))
  } catch (error) {
    deps.onError?.('get', error)
    const failure = passkeyFlowFailure(error)
    return failure === 'cancelled'
      ? { status: 'signInOnly', signInOnly: 'cancelled' }
      : { status: 'failed', reason: failure }
  }
  // Only the passkey asked for may unlock: a wrap under another credential's
  // id would never open.
  if (assertion.response.rawId !== credentialId)
    return { status: 'failed', reason: 'failed' }
  if (assertion.prf?.length !== PRF_OUTPUT_BYTES)
    return { status: 'signInOnly', signInOnly: 'no_prf' }
  const saved = await saveWrap(deps, credentialId, assertion.prf)
  return saved === 'saved'
    ? { status: 'saved' }
    : { status: 'signInOnly', signInOnly: saved }
}

/**
 * Add a Passkey: the owner check, `register/options`, the native create, `POST
 * /passkeys` at once without a wrap, then (unless the platform said it has no
 * PRF) a sign-in for the new credential whose PRF output seals the account key.
 * Without one the passkey stays Sign-in only.
 */
export async function addPasskeyFlow(
  deps: PasskeyFlowDeps,
  context: {
    /** How many passkeys the account has, when the list is in. */
    count?: number
    support?: PasskeySupport
  } = {}
): Promise<PasskeyAddResult> {
  if (context.support && !context.support.passkeys)
    return { status: 'failed', step: 'create', reason: 'not_supported' }
  // The server refuses the 11th only after the password manager saved it.
  if ((context.count ?? 0) >= PASSKEYS_MAX)
    return { status: 'failed', step: 'options', reason: 'limit' }

  const owner = await deps.confirmOwner().catch(() => 'failed' as const)
  if (owner === 'cancelled') return { status: 'cancelled', step: 'owner' }
  if (owner === 'failed')
    return { status: 'failed', step: 'owner', reason: 'owner_failed' }

  let options: Awaited<ReturnType<PasskeyServer['registrationOptions']>>
  try {
    options = await deps.server.registrationOptions()
  } catch (error) {
    return fail(deps, 'options', error)
  }

  let created: CreatedPasskey
  try {
    // The server's options, passed to the platform as they are.
    created = await deps.ceremonies.create(
      options.options as unknown as PublicKeyCredentialCreationOptionsJSON
    )
  } catch (error) {
    return fail(deps, 'create', error)
  }

  let credentialId: string
  try {
    ;({ credentialId } = await deps.server.add({
      challengeToken: options.challengeToken,
      response: created.response,
      label: deps.label?.(),
    }))
  } catch (error) {
    return fail(deps, 'save', error)
  }
  // The server stored the credential just created, or something is wrong.
  if (credentialId !== created.response.rawId)
    return { status: 'failed', step: 'save', reason: 'failed' }

  const signInOnly = (reason: SignInOnlyReason): PasskeyAddResult => ({
    status: 'added',
    credentialId,
    canUnlock: false,
    signInOnly: reason,
  })
  if (created.prf.enabled === false || context.support?.prf === 'no')
    return signInOnly('no_prf')

  const unlocked = await unlockWith(deps, credentialId)
  if (unlocked.status === 'saved')
    return { status: 'added', credentialId, canUnlock: true }
  // It's added either way; a failed sign-in only leaves it Sign-in only.
  return signInOnly(
    unlocked.status === 'signInOnly' ? unlocked.signInOnly : 'not_saved'
  )
}

function fail(
  deps: PasskeyFlowDeps,
  step: PasskeyFlowStep,
  error: unknown
): Extract<PasskeyAddResult, { status: 'cancelled' | 'failed' }> {
  deps.onError?.(step, error)
  const failure = passkeyFlowFailure(error)
  return failure === 'cancelled'
    ? { status: 'cancelled', step }
    : { status: 'failed', step, reason: failure }
}

/**
 * Let It Unlock: a Sign-in-only passkey signs in once more, and its PRF output
 * seals the account key (ADR 0038 §4). The sign-in's own user verification is
 * the owner's check.
 */
export async function letPasskeyUnlockFlow(
  deps: PasskeyFlowDeps,
  credentialId: string
): Promise<PasskeyUnlockResult> {
  const unlocked = await unlockWith(deps, credentialId)
  if (unlocked.status === 'saved') return { status: 'unlocks' }
  if (unlocked.status === 'failed')
    return { status: 'failed', step: 'get', reason: unlocked.reason }
  if (unlocked.signInOnly === 'cancelled')
    return { status: 'cancelled', step: 'get' }
  return unlocked
}

/**
 * Remove, once the User confirmed the warning: the owner check, then
 * `passkeys/remove`. The password manager keeps its copy.
 */
export async function removePasskeyFlow(
  deps: Pick<PasskeyFlowDeps, 'server' | 'confirmOwner' | 'onError'>,
  credentialId: string
): Promise<PasskeyRemoveResult> {
  const owner = await deps.confirmOwner().catch(() => 'failed' as const)
  if (owner === 'cancelled') return { status: 'cancelled' }
  if (owner === 'failed') return { status: 'failed', reason: 'owner_failed' }
  try {
    await deps.server.remove(credentialId)
    return { status: 'removed' }
  } catch (error) {
    deps.onError?.('remove', error)
    const failure = passkeyFlowFailure(error)
    return failure === 'cancelled'
      ? { status: 'cancelled' }
      : { status: 'failed', reason: failure }
  }
}

/**
 * Whether removing this passkey leaves the account none that can unlock, so a
 * computer then needs the recovery key or another device to sign in.
 */
export const isLastUnlocking = (
  passkeys: readonly Pick<Passkey, 'credentialId' | 'canUnlock'>[],
  credentialId: string
) =>
  passkeys.some(
    (passkey) => passkey.credentialId === credentialId && passkey.canUnlock
  ) && passkeys.filter((passkey) => passkey.canUnlock).length === 1
