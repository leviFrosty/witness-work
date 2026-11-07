import type {
  AccountKeyLoss,
  ReplaceAccountKeyResult,
} from '@/lib/accountKey/accountKey'
import { PasskeyError } from '@/lib/passkeys/errors'
import type {
  PasskeyAssertion,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  type PasskeyChallenge,
  type PasskeyFailedReason,
  passkeyFailureFor,
  type PasskeyResponseJSON,
  type PasskeySignIn,
} from '@/lib/serverAccount/passkeyClient'
import {
  type PasskeyServer,
  savePasskeyWrapWith,
} from '@/lib/serverAccount/passkeyFlow'
import {
  openPasskeyWraps,
  type PasskeyUnlockProblem,
} from '@/lib/serverAccount/passkeys'
import {
  type DetachedSession,
  toAccountSessionError,
} from '@/lib/serverAccount/session'

export type PhonePasskeySignInFailure =
  | 'not_supported'
  | 'domain_not_associated'
  | 'no_credentials'
  | 'unknown_passkey'
  | 'passkey_failed'
  | 'credential'
  | 'timeout'
  | 'offline'
  | 'rate_limited'
  | 'update_required'
  | 'unavailable'
  | 'unverified'
  | 'verify_later'
  | 'mismatch'
  | 'replace_failed'
  | 'failed'

export type PhonePasskeySignInResult =
  | {
      status: 'unlocked'
      replaced: ReplaceAccountKeyResult['outcome']
      rejoined: boolean
    }
  | { status: 'cantUnlock'; reason: PasskeyUnlockProblem; prf: boolean }
  | { status: 'declined' }
  | { status: 'cancelled' }
  | {
      status: 'failed'
      reason: PhonePasskeySignInFailure

      serverReason: PasskeyFailedReason | null

      retryAfterMs: number | null

      removalPending?: boolean
    }

export type PendingWrapOutcome =
  | 'saved'
  | 'not_saved'
  | 'key_changed'
  | 'other_account'
  | 'no_prf'

export type PhonePasskeySignInEvent =
  | { type: 'started' }
  | { type: 'succeeded'; unlocked: true }
  | {
      type: 'succeeded'
      unlocked: false
      reason: PasskeyUnlockProblem
      prf: boolean
    }
  | {
      type: 'failed'
      reason: PhonePasskeySignInFailure | 'cancelled' | 'declined'
      serverReason?: PasskeyFailedReason
    }
  | { type: 'wrap'; outcome: PendingWrapOutcome }

export type PhonePasskeySignInStep =
  | 'challenge'
  | 'get'
  | 'assert'
  | 'session'
  | 'replace'

export type PhonePasskeySignInDeps = {
  passkeys: {
    challenge: () => Promise<PasskeyChallenge>

    get: (
      options: PublicKeyCredentialRequestOptionsJSON
    ) => Promise<PasskeyAssertion>

    assert: (args: {
      challengeToken: string
      response: PasskeyResponseJSON
    }) => Promise<PasskeySignIn>
  }
  account: {
    openDetached: (
      accountKey: Uint8Array,
      call: { accountId: string }
    ) => Promise<DetachedSession>

    current: () => Promise<Uint8Array | null>

    lastAccountId: () => string | null
    lossIfReplaced: (
      accountKey: Uint8Array,
      call: { accountId: string }
    ) => Promise<AccountKeyLoss>

    replace: (
      accountKey: Uint8Array,
      session: DetachedSession,
      accountId: string
    ) => Promise<ReplaceAccountKeyResult>
  }

  confirmReplace: (loss: AccountKeyLoss) => Promise<boolean>

  wrapServer: (
    accountKey: Uint8Array
  ) => Pick<PasskeyServer, 'account' | 'wrap'>
  randomBytes: (length: number) => Uint8Array

  isRemovalPending?: (error: unknown) => boolean
  onEvent?: (event: PhonePasskeySignInEvent) => void

  onError?: (step: PhonePasskeySignInStep, error: unknown) => void
}

type Pending = {
  accountPub: string
  credentialId: string
  reason: PasskeyUnlockProblem
  prf: Uint8Array | null
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i])

type Failed = Extract<PhonePasskeySignInResult, { status: 'failed' }>

const failed = (
  reason: PhonePasskeySignInFailure,
  extra: Partial<Omit<Failed, 'status' | 'reason'>> = {}
): Failed => ({
  status: 'failed',
  reason,
  serverReason: null,
  retryAfterMs: null,
  ...extra,
})

const NATIVE: Record<
  PasskeyError['code'],
  PhonePasskeySignInFailure | 'cancelled'
> = {
  cancelled: 'cancelled',
  not_supported: 'not_supported',
  no_credentials: 'no_credentials',
  timeout: 'timeout',
  domain_not_associated: 'domain_not_associated',
  already_registered: 'failed',
  failed: 'passkey_failed',
}

export function phonePasskeySignInFailureFor(
  error: unknown
): Failed | { status: 'cancelled' } {
  if (error instanceof PasskeyError) {
    const mapped = NATIVE[error.code] ?? 'failed'
    return mapped === 'cancelled' ? { status: 'cancelled' } : failed(mapped)
  }
  const { failure, reason, retryAfterMs } = passkeyFailureFor(error)
  switch (failure) {
    case 'offline':
    case 'unavailable':
    case 'unverified':
      return failed(failure)
    case 'verifyLater':
      return failed('verify_later')
    case 'updateRequired':
      return failed('update_required')
    case 'rateLimited':
      return failed('rate_limited', { retryAfterMs })
    case 'passkeyFailed': {
      const serverReason = reason as PasskeyFailedReason
      return failed(
        serverReason === 'unknown_credential' || serverReason === 'user_handle'
          ? 'unknown_passkey'
          : 'passkey_failed',
        { serverReason }
      )
    }
    default:
      return failed('failed')
  }
}

function sessionFailure(error: unknown): Failed {
  const session = toAccountSessionError(error)
  switch (session.failure) {
    case 'offline':
    case 'cancelled':
      return failed('offline')
    case 'unavailable':
      return failed('unavailable')
    case 'upgrade':
      return failed('update_required')
    case 'attestation':
      return failed(
        session.attestation === 'temporary' ? 'verify_later' : 'unverified'
      )
    case 'rateLimited':
      return failed('rate_limited', { retryAfterMs: session.retryAfterMs })
    default:
      return failed('failed')
  }
}

export function createPhonePasskeySignIn(deps: PhonePasskeySignInDeps) {
  let pending: Pending | null = null
  let busy = false

  const emit = (event: PhonePasskeySignInEvent) => {
    try {
      deps.onEvent?.(event)
    } catch {}
  }

  const report = (result: PhonePasskeySignInResult) => {
    if (result.status === 'unlocked')
      emit({ type: 'succeeded', unlocked: true })
    else if (result.status === 'cantUnlock')
      emit({
        type: 'succeeded',
        unlocked: false,
        reason: result.reason,
        prf: result.prf,
      })
    else if (result.status === 'failed')
      emit({
        type: 'failed',
        reason: result.reason,
        ...(result.serverReason && { serverReason: result.serverReason }),
      })
    else emit({ type: 'failed', reason: result.status })
    return result
  }

  function forget() {
    pending?.prf?.fill(0)
    pending = null
  }

  async function adopt(
    accountKey: Uint8Array,
    accountId: string
  ): Promise<PhonePasskeySignInResult> {
    let opened: DetachedSession
    try {
      opened = await deps.account.openDetached(accountKey, { accountId })
    } catch (error) {
      deps.onError?.('session', error)
      return sessionFailure(error)
    }
    const close = () => opened.close().catch(() => undefined)

    if (opened.accountId !== accountId) {
      await close()
      return failed('mismatch')
    }
    try {
      const current = await deps.account.current()
      const differs = current !== null && !sameBytes(current, accountKey)
      const rejoining = accountId === deps.account.lastAccountId()

      if (differs && !rejoining) {
        const loss = await deps.account.lossIfReplaced(accountKey, {
          accountId,
        })
        if (!(await deps.confirmReplace(loss))) {
          await close()
          return { status: 'declined' }
        }
      }
      const { outcome } = await deps.account.replace(
        accountKey,
        opened,
        accountId
      )

      await close()
      return {
        status: 'unlocked',
        replaced: outcome,
        rejoined: differs && rejoining,
      }
    } catch (error) {
      deps.onError?.('replace', error)
      await close()
      return failed('replace_failed', {
        removalPending: deps.isRemovalPending?.(error) ?? false,
      })
    }
  }

  async function run(): Promise<PhonePasskeySignInResult> {
    let step: PhonePasskeySignInStep = 'challenge'
    let prf: Uint8Array | null = null
    try {
      const challenge = await deps.passkeys.challenge()
      step = 'get'
      const assertion = await deps.passkeys.get(
        challenge.options as unknown as PublicKeyCredentialRequestOptionsJSON
      )
      prf = assertion.prf
      step = 'assert'

      const signIn = await deps.passkeys.assert({
        challengeToken: challenge.challengeToken,
        response: assertion.response as unknown as PasskeyResponseJSON,
      })
      if (signIn.credentialId !== assertion.response.id)
        return failed('credential')
      const unlock = openPasskeyWraps({
        prfOutput: prf,
        accountId: signIn.accountId,
        accountPub: signIn.accountPub,
        credentialId: signIn.credentialId,
        keyEpoch: signIn.keyEpoch,
        wraps: signIn.wraps,
      })
      if (!unlock.ok) {
        forget()
        pending = {
          accountPub: signIn.accountPub,
          credentialId: signIn.credentialId,
          reason: unlock.reason,
          prf,
        }
        const hasPrf = prf !== null

        prf = null
        return { status: 'cantUnlock', reason: unlock.reason, prf: hasPrf }
      }
      prf?.fill(0)
      prf = null

      forget()
      return await adopt(unlock.accountKey, signIn.accountId)
    } catch (error) {
      deps.onError?.(step, error)
      return phonePasskeySignInFailureFor(error)
    } finally {
      prf?.fill(0)
    }
  }

  async function signIn(): Promise<PhonePasskeySignInResult> {
    if (busy) return { status: 'cancelled' }
    busy = true
    emit({ type: 'started' })
    try {
      return report(await run())
    } finally {
      busy = false
    }
  }

  async function keyArrived(
    accountKey: Uint8Array
  ): Promise<PendingWrapOutcome | null> {
    const waiting = pending
    pending = null
    if (!waiting) return null
    let outcome: PendingWrapOutcome
    try {
      if (deriveAccountSigningKey(accountKey).publicKey !== waiting.accountPub)
        outcome = 'other_account'
      else if (!waiting.prf) outcome = 'no_prf'
      else {
        const saved = await savePasskeyWrapWith(
          {
            server: deps.wrapServer(accountKey),
            accountKey,
            randomBytes: deps.randomBytes,
          },
          waiting.credentialId,
          waiting.prf
        )
        outcome =
          saved === 'saved' || saved === 'key_changed' || saved === 'no_prf'
            ? saved
            : 'not_saved'
      }
    } catch {
      outcome = 'not_saved'
    } finally {
      waiting.prf?.fill(0)
    }
    emit({ type: 'wrap', outcome })
    return outcome
  }

  return {
    signIn,
    keyArrived,

    pending: (): { reason: PasskeyUnlockProblem; prf: boolean } | null =>
      pending ? { reason: pending.reason, prf: pending.prf !== null } : null,
    forget,
  }
}

export type PhonePasskeySignIn = ReturnType<typeof createPhonePasskeySignIn>
