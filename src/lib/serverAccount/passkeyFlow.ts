import { toB64u } from '@/lib/bytes'
import { PasskeyError } from '@/lib/passkeys/errors'
import {
  type SensitiveCheck,
  StepUpNotConfirmedError,
  stopsQuietly,
} from '@/lib/sensitiveCheck'
import type {
  CreatedPasskey,
  PasskeyAssertion,
  PasskeySupport,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'
import { HttpError } from '@/lib/http/request'
import type { CreateGate } from '@/lib/serverAccount/stepUpCreate'
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

export const PASSKEYS_MAX = 10

export const PRF_OUTPUT_BYTES = 32

export type PasskeyServer = {
  registrationOptions: () => Promise<PasskeyChallenge & { userHandle: string }>
  add: (args: {
    challengeToken: string
    response: CreatedPasskey['response']
    label?: string
  }) => Promise<{ credentialId: string }>
  wrap: (args: PasskeyWrap & { credentialId: string }) => Promise<void>
  remove: (credentialId: string) => Promise<void>

  account: () => Promise<{
    accountId: string
    accountPub: string
    keyEpoch: number
  }>
}

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

  confirmOwner: () => Promise<SensitiveCheck>

  beforeCreate?: () => Promise<CreateGate>

  createStopIsFailure?: boolean
  accountKey: Uint8Array

  rpId?: string
  randomBytes: (length: number) => Uint8Array

  label?: () => string | undefined

  onError?: (step: PasskeyFlowStep, error: unknown) => void
}

export type PasskeyFlowFailure =
  | 'owner_failed'
  | 'not_supported'
  | 'domain_not_associated'
  | 'already_registered'
  | 'no_credentials'
  | 'limit'
  | 'offline'
  | 'timeout'
  | 'update_required'
  | 'unverified'
  | 'unavailable'
  | 'rate_limited'
  | 'conflict'
  | 'step_up_expired'
  | 'not_created'
  | 'failed'

export type SignInOnlyReason =
  | 'no_prf'
  | 'cancelled'
  | 'key_changed'
  | 'not_saved'

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

export function passkeyFlowFailure(
  error: unknown
): PasskeyFlowFailure | 'cancelled' {
  if (error instanceof PasskeyError) return NATIVE[error.code] ?? 'failed'

  if (error instanceof StepUpNotConfirmedError) return 'cancelled'
  return SERVER[passkeyFailureFor(error).failure] ?? 'failed'
}

const isConflict = (error: unknown) =>
  error instanceof HttpError && error.serverCode === 'conflict'

export function unlockRequest(
  deps: Pick<PasskeyFlowDeps, 'randomBytes'>,
  credentialId: string,
  rpId: string | undefined
): PublicKeyCredentialRequestOptionsJSON {
  return {
    ...(rpId && { rpId }),
    challenge: toB64u(deps.randomBytes(32)),
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
    userVerification: 'required',
    timeout: 300_000,
  }
}

export async function savePasskeyWrapWith(
  deps: Pick<PasskeyFlowDeps, 'accountKey' | 'randomBytes'> & {
    server: Pick<PasskeyServer, 'account' | 'wrap'>
  },
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

async function unlockWith(
  deps: PasskeyFlowDeps,
  credentialId: string,
  rpId = deps.rpId
): Promise<
  | { status: 'saved' }
  | { status: 'signInOnly'; signInOnly: SignInOnlyReason }
  | { status: 'failed'; reason: PasskeyFlowFailure }
> {
  let assertion: PasskeyAssertion
  try {
    assertion = await deps.ceremonies.get(
      unlockRequest(deps, credentialId, rpId)
    )
  } catch (error) {
    deps.onError?.('get', error)
    const failure = passkeyFlowFailure(error)
    return failure === 'cancelled'
      ? { status: 'signInOnly', signInOnly: 'cancelled' }
      : { status: 'failed', reason: failure }
  }

  if (assertion.response.rawId !== credentialId)
    return { status: 'failed', reason: 'failed' }
  if (assertion.prf?.length !== PRF_OUTPUT_BYTES)
    return { status: 'signInOnly', signInOnly: 'no_prf' }
  const saved = await savePasskeyWrapWith(deps, credentialId, assertion.prf)
  return saved === 'saved'
    ? { status: 'saved' }
    : { status: 'signInOnly', signInOnly: saved }
}

export async function addPasskeyFlow(
  deps: PasskeyFlowDeps,
  context: {
    count?: number
    support?: PasskeySupport
  } = {}
): Promise<PasskeyAddResult> {
  if (context.support && !context.support.passkeys)
    return { status: 'failed', step: 'create', reason: 'not_supported' }

  if ((context.count ?? 0) >= PASSKEYS_MAX)
    return { status: 'failed', step: 'options', reason: 'limit' }

  const owner = await deps.confirmOwner().catch(() => 'failed' as const)
  if (stopsQuietly(owner)) return { status: 'cancelled', step: 'owner' }
  if (owner === 'failed')
    return { status: 'failed', step: 'owner', reason: 'owner_failed' }

  let options: Awaited<ReturnType<PasskeyServer['registrationOptions']>>
  try {
    options = await deps.server.registrationOptions()
  } catch (error) {
    return fail(deps, 'options', error)
  }

  const gate: CreateGate = deps.beforeCreate
    ? await deps.beforeCreate().catch(() => ({ status: 'expired' }) as const)
    : { status: 'go', timeoutMs: Number.POSITIVE_INFINITY }
  if (gate.status === 'cancelled')
    return { status: 'cancelled', step: 'create' }
  if (gate.status === 'expired')
    return { status: 'failed', step: 'create', reason: 'step_up_expired' }

  let created: CreatedPasskey
  try {
    const creation =
      options.options as unknown as PublicKeyCredentialCreationOptionsJSON
    created = await deps.ceremonies.create(
      Number.isFinite(gate.timeoutMs)
        ? {
            ...creation,
            timeout: Math.min(
              creation.timeout ?? gate.timeoutMs,
              gate.timeoutMs
            ),
          }
        : creation
    )
  } catch (error) {
    const stopped = fail(deps, 'create', error)
    return stopped.status === 'cancelled' && deps.createStopIsFailure
      ? { status: 'failed', step: 'create', reason: 'not_created' }
      : stopped
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

  const registered = (options.options as { rp?: { id?: unknown } }).rp?.id
  const unlocked = await unlockWith(
    deps,
    credentialId,
    deps.rpId ?? (typeof registered === 'string' ? registered : undefined)
  )
  if (unlocked.status === 'saved')
    return { status: 'added', credentialId, canUnlock: true }

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

export async function removePasskeyFlow(
  deps: Pick<PasskeyFlowDeps, 'server' | 'confirmOwner' | 'onError'>,
  credentialId: string
): Promise<PasskeyRemoveResult> {
  const owner = await deps.confirmOwner().catch(() => 'failed' as const)
  if (stopsQuietly(owner)) return { status: 'cancelled' }
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

export const isLastUnlocking = (
  passkeys: readonly Pick<Passkey, 'credentialId' | 'canUnlock'>[],
  credentialId: string
) =>
  passkeys.some(
    (passkey) => passkey.credentialId === credentialId && passkey.canUnlock
  ) && passkeys.filter((passkey) => passkey.canUnlock).length === 1
