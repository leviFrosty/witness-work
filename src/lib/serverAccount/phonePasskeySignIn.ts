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

/**
 * Signing in with a passkey on a new phone (docs/passkeys-protocol.md, "The
 * app" → "Signing in"; ADR 0038 §5 and §6): `passkeys/challenge`, the
 * platform's get with the PRF salt, `passkeys/assert`, then the wraps, checked
 * against the account's `accountPub`.
 *
 * - **It unlocks:** like a handoff's new phone, this phone opens its own attested
 *   session with the key, only into the passkey's account (the assertion's
 *   ticket is for browsers and is never used), and adopts it. It always asks
 *   before replacing a different key here, on both platforms: a shared password
 *   manager (iCloud Keychain, Google Password Manager's family sharing) can
 *   offer another person's passkey. Signing back in to the account this phone
 *   was on (its key changed) asks nothing, as a handoff's rejoin.
 * - **It signs in but can't unlock:** the account, the credential and the PRF
 *   output (if any) stay in memory only. Once the key arrives another way (the
 *   other phone's QR code, or the recovery key) and its session is open,
 *   `keyArrived` saves a wrap for this passkey, so it unlocks next time. Trying
 *   another passkey keeps this one until the new one unlocks or can't: a cancel
 *   or a failure leaves it waiting.
 *
 * PRF output is zeroed once used, on every path. Nothing here throws.
 */

/** Why a sign-in didn't finish, as the screen explains it and analytics. */
export type PhonePasskeySignInFailure =
  /** This phone can't use passkeys. */
  | 'not_supported'
  /** The app isn't associated with the passkey domain yet. */
  | 'domain_not_associated'
  /** No passkey for WitnessWork on this phone or in its password manager. */
  | 'no_credentials'
  /** The passkey is one no account has any more. */
  | 'unknown_passkey'
  /** The passkey didn't verify; `serverReason` says why. */
  | 'passkey_failed'
  /** The server verified another credential than the phone used. */
  | 'credential'
  | 'timeout'
  | 'offline'
  | 'rate_limited'
  | 'update_required'
  /** Accounts are off on the server. */
  | 'unavailable'
  /** This phone can't prove it's WitnessWork, so it gets no session. */
  | 'unverified'
  /** The same, but only for now. */
  | 'verify_later'
  /** The session the key opened is another account's than the passkey's. */
  | 'mismatch'
  /** Replacing this phone's key failed. */
  | 'replace_failed'
  | 'failed'

export type PhonePasskeySignInResult =
  /**
   * The key is this phone's now (`unchanged`: it already was). `rejoined`: it's
   * the account this phone was on, under a changed key.
   */
  | {
      status: 'unlocked'
      replaced: ReplaceAccountKeyResult['outcome']
      rejoined: boolean
    }
  /** Signed in, not unlocked: the other phone or the recovery key finishes. */
  | { status: 'cantUnlock'; reason: PasskeyUnlockProblem; prf: boolean }
  /** The User declined the replace-key warning; nothing changed. */
  | { status: 'declined' }
  /** The User closed the passkey sheet. */
  | { status: 'cancelled' }
  | {
      status: 'failed'
      reason: PhonePasskeySignInFailure
      /** `passkey_failed`'s reason from the server. */
      serverReason: PasskeyFailedReason | null
      /** When a rate limit lets up, when the server said. */
      retryAfterMs: number | null
      /** Delete Buddies is still waiting to tell a buddy. */
      removalPending?: boolean
    }

/** What came of saving a wrap for the passkey that couldn't unlock. */
export type PendingWrapOutcome =
  /** It unlocks next time. */
  | 'saved'
  /** Saving didn't get through; it stays Sign-in only. */
  | 'not_saved'
  /** The account key changed meanwhile. */
  | 'key_changed'
  /** The key that arrived is another account's: nothing saved. */
  | 'other_account'
  /** The passkey gave no PRF output, so it can't unlock. */
  | 'no_prf'

/** What analytics records; no ids, keys or names. */
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
    /** `passkeys/challenge` for a sign-in, with the build's RP ID. */
    challenge: () => Promise<PasskeyChallenge>
    /** The platform's get, with the PRF salt (`@/lib/passkeys`). */
    get: (
      options: PublicKeyCredentialRequestOptionsJSON
    ) => Promise<PasskeyAssertion>
    /** `passkeys/assert`. */
    assert: (args: {
      challengeToken: string
      response: PasskeyResponseJSON
    }) => Promise<PasskeySignIn>
  }
  account: {
    /**
     * An attested session for `accountKey`, not yet this phone's, only into
     * `accountId` (never another account, and never a new one).
     */
    openDetached: (
      accountKey: Uint8Array,
      call: { accountId: string }
    ) => Promise<DetachedSession>
    /** This phone's account key, if any. */
    current: () => Promise<Uint8Array | null>
    /** The account this phone was last on (`serverAccount.lastAccountId`). */
    lastAccountId: () => string | null
    lossIfReplaced: (
      accountKey: Uint8Array,
      call: { accountId: string }
    ) => Promise<AccountKeyLoss>
    /** Makes `accountKey` (`accountId`'s) this phone's, adopting `session`. */
    replace: (
      accountKey: Uint8Array,
      session: DetachedSession,
      accountId: string
    ) => Promise<ReplaceAccountKeyResult>
  }
  /**
   * The replace-key warning a handoff shows, with what replacing loses. Asked
   * whenever this phone has a different key for another account.
   */
  confirmReplace: (loss: AccountKeyLoss) => Promise<boolean>
  /** The account's routes for saving a wrap, through `accountKey`'s session. */
  wrapServer: (
    accountKey: Uint8Array
  ) => Pick<PasskeyServer, 'account' | 'wrap'>
  randomBytes: (length: number) => Uint8Array
  /** Whether a replace failed because Delete Buddies is still pending. */
  isRemovalPending?: (error: unknown) => boolean
  onEvent?: (event: PhonePasskeySignInEvent) => void
  /** Each error that ended a step, for logs. */
  onError?: (step: PhonePasskeySignInStep, error: unknown) => void
}

/** The passkey that signed in but can't unlock, until the key arrives. */
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

/** A ceremony's or a passkey request's error, as a failure or a cancel. */
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

/** Opening the key's own attested session failed. */
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
    } catch {
      // Analytics never stops a sign-in.
    }
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

  /** Forgets the passkey that couldn't unlock, its PRF output zeroed first. */
  function forget() {
    pending?.prf?.fill(0)
    pending = null
  }

  /** The unlocked key, adopted as a handoff's new phone adopts it. */
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
    // The same accountPub always opens a session for the same accountId.
    if (opened.accountId !== accountId) {
      await close()
      return failed('mismatch')
    }
    try {
      const current = await deps.account.current()
      const differs = current !== null && !sameBytes(current, accountKey)
      const rejoining = accountId === deps.account.lastAccountId()
      // Another account's key always asks, whatever it loses: a shared
      // password manager may have offered someone else's passkey.
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
      // Adopted, or the key was already here with a session of its own, and
      // this extra one ends.
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
      // A phone's assertion never carries a ticket it uses; it attests.
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
        // This passkey waits now, in place of one that waited before.
        forget()
        pending = {
          accountPub: signIn.accountPub,
          credentialId: signIn.credentialId,
          reason: unlock.reason,
          prf,
        }
        const hasPrf = prf !== null
        // Handed to `pending`, which zeroes it.
        prf = null
        return { status: 'cantUnlock', reason: unlock.reason, prf: hasPrf }
      }
      prf?.fill(0)
      prf = null
      // Unlocked: a passkey that waited before has nothing left to finish.
      forget()
      return await adopt(unlock.accountKey, signIn.accountId)
    } catch (error) {
      deps.onError?.(step, error)
      return phonePasskeySignInFailureFor(error)
    } finally {
      prf?.fill(0)
    }
  }

  /**
   * Sign In with a Passkey, start to end. A passkey that couldn't unlock keeps
   * waiting until this one unlocks or can't unlock, which replaces it; a cancel
   * or a failure leaves it. A second call while one runs is a cancel.
   */
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

  /**
   * The key arrived another way and its session is open: saves this passkey's
   * wrap of it, when it's the passkey's account and gave PRF output, then
   * forgets the passkey. `null` when no passkey was waiting.
   */
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
    /** The passkey that couldn't unlock, while it waits for the key. */
    pending: (): { reason: PasskeyUnlockProblem; prf: boolean } | null =>
      pending ? { reason: pending.reason, prf: pending.prf !== null } : null,
    forget,
  }
}

export type PhonePasskeySignIn = ReturnType<typeof createPhonePasskeySignIn>
