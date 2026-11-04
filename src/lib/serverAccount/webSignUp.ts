import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { fromB64u, sameBytes, toB64u } from '@/lib/bytes'
import { PasskeyError, type PasskeyErrorCode } from '@/lib/passkeys/errors'
import type {
  CreatedPasskey,
  PasskeyAssertion,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'
import { HttpError } from '@/lib/http/request'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  type PasskeyChallenge,
  type PasskeyFailure,
  passkeyFailureFor,
  type PasskeyResponseJSON,
  type PasskeySignIn,
} from '@/lib/serverAccount/passkeyClient'
import {
  PRF_OUTPUT_BYTES,
  unlockRequest,
} from '@/lib/serverAccount/passkeyFlow'
import {
  newPasskeyWrapId,
  passkeyName,
  wrapAccountKey,
} from '@/lib/serverAccount/passkeys'
import type { OpenedSession } from '@/lib/serverAccount/sessionClient'
import {
  type WebAccount,
  type WebSignIn as WebAccountSignIn,
  WebSignInError,
} from '@/lib/serverAccount/webAccount'

/**
 * Signing up on the web (docs/passkeys-protocol.md, "Web sign-up" and "Signing
 * up on the web"; ADR 0038 §8), as a state machine the screen drives:
 *
 * 1. Turnstile's token → `web/signup/options`: the new account's id, user handle
 *    and challenge. The browser is asked only for what sign-up needs
 *    (`signUpCreationOptions`): this page's RP, the `WitnessWork <tag>` name, a
 *    discoverable passkey with user verification, no attestation.
 * 2. The account key, made and stored sealed (`webAccountKey.create`).
 * 3. The passkey, then a get for it alone that confirms PRF. With PRF output the
 *    key is wrapped for the account at epoch 0; without it (or a cancelled get)
 *    the passkey is Sign-in only.
 * 4. `web/signup`, signed by the new key: the account, the passkey, its wrap and a
 *    web session, in one batch. The session is kept (`adoptSignupSession`).
 * 5. The recovery key, until the User says they saved it.
 *
 * One tab signs up at a time: the whole sign-up, and Finish, hold the
 * `ww-signup` Web Lock (`deps.lock`), and only a tab that gets it cleans up
 * what another left.
 *
 * **A key is deleted only when it's provably this sign-up's, and the server
 * provably doesn't have its account:** the key's public key is the mark's, and
 * `web/signup` wasn't sent, or refused it before its batch, or the server
 * doesn't know the passkey (`unknown_credential`). Then the passkey is reported
 * unknown too (`signalUnknownPasskey`). Any other key, an unreadable mark, or
 * data this browser keeps for an account stops sign-up instead.
 *
 * Once the account may exist (`web/signup` sent), the key stays until the
 * outcome is known:
 *
 * - **A lost answer** (`conflict` for this key, `replay`, or a used challenge):
 *   the account exists, and the passkey just made signs in to it. The browser
 *   holds the key, so a Sign-in-only passkey finishes too.
 * - **No answer** (offline, a timeout, a server error): Finish sends it again,
 *   whose answer is the account, a lost answer, or (once the challenge expired)
 *   the passkey's sign-in. After a reload, the passkey signs in.
 *
 * Every way it finishes ends on the recovery key's gate. A mark in the
 * browser's secure store (`WebSignUpMark`) keeps the stage across reloads; the
 * wipe that signing out does deletes it.
 */

/**
 * - `key`: the key is stored, and `web/signup` wasn't sent: nothing is on the
 *   server.
 * - `sent`: `web/signup` was sent, and its answer hasn't arrived.
 * - `created`: the account exists; its recovery key is still to be saved.
 */
export type WebSignUpStage = 'key' | 'sent' | 'created'

export type WebSignUpMark = {
  accountId: string
  stage: WebSignUpStage
  /** The new key's public key, to tell it from any other. */
  accountPub: string
  /** The new passkey, once made. */
  credentialId?: string
  /** Its RP ID, to report it unknown if no account comes of it. */
  rpId?: string
  /** It has no wrap: it signs in but can't unlock the account on its own. */
  signInOnly?: boolean
  /** Its name, `WitnessWork <tag>`, to say which passkey finishes. */
  passkeyName?: string
}

/** A mark is stored, but can't be read: an account may exist. */
export class WebSignUpMarkUnreadable extends Error {
  constructor(options?: { cause?: unknown }) {
    super('web sign-up: the mark is unreadable', options)
    this.name = 'WebSignUpMarkUnreadable'
  }
}

export type WebSignUpMarkStore = {
  /** Null when there's none; throws when one is stored but unreadable. */
  read: () => Promise<WebSignUpMark | null>
  write: (mark: WebSignUpMark | null) => Promise<void>
}

/**
 * In the secure key/value store, which the wipe clears: where a sign-up is,
 * across reloads. Ids, a public key and the passkey's name; never a secret.
 */
export const WEB_SIGN_UP_MARK_KEY = 'web-signup'

/** The Web Lock a sign-up, and Finish, hold. */
export const WEB_SIGN_UP_LOCK = 'ww-signup'

const STAGES: readonly WebSignUpStage[] = ['key', 'sent', 'created']

/** A plain key/value store (`secureKv`). */
type PlainKv = {
  get: <T>(key: string) => Promise<T | null | undefined>
  set: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<void>
}

/** The mark in `kv`; a malformed or unreadable one throws. */
export function createWebSignUpMarkStore(kv: PlainKv): WebSignUpMarkStore {
  return {
    read: async () => {
      let value: WebSignUpMark | null | undefined
      try {
        value = await kv.get<WebSignUpMark>(WEB_SIGN_UP_MARK_KEY)
      } catch (cause) {
        throw new WebSignUpMarkUnreadable({ cause })
      }
      if (value === undefined || value === null) return null
      if (
        typeof value !== 'object' ||
        typeof value.accountId !== 'string' ||
        typeof value.accountPub !== 'string' ||
        !STAGES.includes(value.stage)
      )
        throw new WebSignUpMarkUnreadable()
      return value
    },
    write: (value) =>
      value === null
        ? kv.delete(WEB_SIGN_UP_MARK_KEY)
        : kv.set(WEB_SIGN_UP_MARK_KEY, value),
  }
}

/**
 * Why storing `accountKey` would replace the key of an account a web sign-up
 * may have made, or null when nothing stops it:
 *
 * - `signUpPending`: a `sent` or `created` mark for another key, or a `key` mark
 *   while another tab holds the `ww-signup` lock (`lockFree`).
 * - `keyHeld`: an unreadable mark beside a stored key that isn't this one.
 *
 * A sign-in keeps nothing then (`WebAccountDeps.signUpKeyHeld`). Throws when
 * storage can't be read.
 */
export function createSignUpKeyGuard({
  mark,
  readStoredKey,
  lockFree,
}: {
  mark: WebSignUpMarkStore
  readStoredKey: () => Promise<Uint8Array | null>
  /** Whether no tab holds the `ww-signup` lock (`ifAvailable`). */
  lockFree: () => Promise<boolean>
}) {
  return async (
    accountKey: Uint8Array
  ): Promise<'signUpPending' | 'keyHeld' | null> => {
    const accountPub = publicKeyOf(accountKey)
    let read: WebSignUpMark | null
    try {
      read = await mark.read()
    } catch (error) {
      if (!(error instanceof WebSignUpMarkUnreadable)) throw error
      const stored = await readStoredKey()
      return stored !== null && publicKeyOf(stored) !== accountPub
        ? 'keyHeld'
        : null
    }
    if (read === null || read.accountPub === accountPub) return null
    if (read.stage !== 'key') return 'signUpPending'
    // Never sent: a leftover, unless another tab is still making it.
    return (await lockFree()) ? null : 'signUpPending'
  }
}

/** Why a sign-up didn't finish, as the screen explains it. */
export type WebSignUpFailure =
  /** The User closed a passkey prompt. Shown as nothing. */
  | 'cancelled'
  /** The prompt to save the passkey closed, so no account was made. */
  | 'passkeyNotSaved'
  /** This browser can't make passkeys. */
  | 'notSupported'
  /** The passkey didn't verify, or the browser couldn't make it. */
  | 'passkeyFailed'
  /** The security check (Turnstile) refused. */
  | 'turnstileFailed'
  /** Too many sign-ups from here: `retryAfterMs` says when to try again. */
  | 'rateLimited'
  /** Sign-up is paused on the server (`disabled`). */
  | 'paused'
  /** The server can't take sign-ups right now (`unavailable`). */
  | 'unavailable'
  /** The browser says it's offline. */
  | 'offline'
  /** Online, but no answer from WitnessWork. */
  | 'unreachable'
  | 'updateRequired'
  /** This browser couldn't store the key or the session. */
  | 'storage'
  /** Another tab of this browser is signing up. */
  | 'otherTab'
  /** The passkey picked to finish isn't the one this sign-up made. */
  | 'wrongPasskey'
  /** Finish's prompt closed: `passkeyName` says which passkey to pick. */
  | 'pickPasskey'
  /** Finishing found no account: the sign-up never reached the server. */
  | 'notCreated'
  | 'failed'

/** Where a sign-up stopped, for analytics. */
export type WebSignUpStep = 'options' | 'key' | 'create' | 'signup' | 'finish'

export type WebSignUpProblem = {
  failure: Exclude<WebSignUpFailure, 'cancelled'>
  retryAfterMs: number | null
  /** For `pickPasskey`: the passkey that finishes. */
  passkeyName?: string
}

export type WebSignUpState = {
  /** `resume` read what an earlier sign-up left. */
  ready: boolean
  busy: boolean
  problem: WebSignUpProblem | null
  /**
   * `web/signup` was sent but its outcome isn't known: Finish completes it,
   * with the passkey just made. Nothing here deletes the key meanwhile.
   */
  finishing: boolean
  /**
   * Signed up: the recovery key shows until the User saves it. `signInOnly`
   * when the passkey can't unlock the account on its own.
   */
  recoveryKey: { signInOnly: boolean } | null
  /** While finishing: `sent` when the account may exist, `created` when it does. */
  finishStage: 'sent' | 'created' | null
  /**
   * The key this browser holds, checked against the mark, as the recovery key
   * that signs in to its account instead of a passkey:
   *
   * - `passkeyGone`: the account exists; its passkey doesn't any more.
   * - `mayExist`: the account may exist (`sent`); its passkey is gone.
   * - `unreadable`: an unreadable mark beside a stored key; how far its sign-up
   *   got isn't known.
   *
   * Signing in with it settles it: the account (onto the gate), or no account
   * (`forgetUnknownAccount`).
   */
  heldKey: {
    recoveryKey: string
    why: 'passkeyGone' | 'mayExist' | 'unreadable'
  } | null
}

/**
 * Analytics' `reason` for a failed sign-up: the failure, the browser passkey
 * prompt's code, or the server's failure with its finer reason after a colon
 * (`passkeyFailed:registration`).
 */
export type WebSignUpFailureReason =
  | WebSignUpFailure
  | PasskeyErrorCode
  | PasskeyFailure
  | `${PasskeyFailure}:${string}`
  /** The creation options weren't what sign-up can use. */
  | 'options'
  /** The server's answer was another account's or credential's. */
  | 'mismatch'
  /** A key this sign-up didn't make is stored here. */
  | 'keyPresent'
  /** This browser keeps an account's data, or can't tell. */
  | 'keptData'
  /** A mark is stored but unreadable, beside a key. */
  | 'markUnreadable'
  /** Finish found no key, or another, in storage: nothing here can finish. */
  | 'keyMissing'

/** What analytics records; no ids, keys or names. */
export type WebSignUpEvent =
  | { type: 'started' }
  | {
      type: 'completed'
      /** The passkey can unlock the account. */
      prf: boolean
      /** Finished by signing in with the passkey, after a lost answer. */
      finished: boolean
    }
  | { type: 'failed'; step: WebSignUpStep; reason: WebSignUpFailureReason }
  | { type: 'recoveryKeySaved' }

/** `web/signup`'s fields, besides the signature. */
export type WebSignUpRequest = {
  challengeToken: string
  response: PasskeyResponseJSON
  wrapId?: string
  wrap?: string
  label?: string
  device?: string
  appVersion?: string
}

/**
 * Runs `run` holding the `ww-signup` lock, if no other tab holds it: false when
 * one does, and `run` didn't run.
 */
export type WebSignUpLock = (run: () => Promise<void>) => Promise<boolean>

export type WebSignUpDeps = {
  account: Pick<
    WebAccount,
    'adoptSignupSession' | 'openWebSessionWithTicket' | 'state'
  >
  /**
   * The data owner record (`DATA_OWNER_KEY`), read fresh: the account id this
   * browser's data belongs to, `''` for data made signed out, null for none.
   */
  owner: { read: () => Promise<string | null> }
  accountKey: {
    /** Makes and stores the key (`webAccountKey.create`). */
    create: () => Promise<Uint8Array>
    /** Deletes it, when it's still the one stored. */
    discard: (made: Uint8Array) => Promise<void>
    /** The stored key, read fresh: never a tab's memory from launch. */
    readStored: () => Promise<Uint8Array | null>
  }
  server: {
    /** `web/signup/options`. */
    options: (
      turnstileToken: string
    ) => Promise<PasskeyChallenge & { accountId: string; userHandle: string }>
    /** `web/signup`, signed by `accountKey`, with the session's capabilities. */
    signup: (
      accountKey: Uint8Array,
      request: WebSignUpRequest
    ) => Promise<OpenedSession & { credentialId: string }>
    /** `passkeys/challenge` for a sign-in. */
    signInChallenge: () => Promise<PasskeyChallenge>
    /** `passkeys/assert`. */
    assert: (args: {
      challengeToken: string
      response: PasskeyResponseJSON
    }) => Promise<PasskeySignIn>
    /** Ends a session this browser won't keep. */
    closeOpened: (accessToken: string) => Promise<void>
  }
  /** `@/lib/passkeys`' create and get: PRF evaluated, kept off the response. */
  ceremonies: {
    create: (
      options: PublicKeyCredentialCreationOptionsJSON
    ) => Promise<CreatedPasskey>
    get: (
      options: PublicKeyCredentialRequestOptionsJSON
    ) => Promise<PasskeyAssertion>
  }
  /**
   * Tells the password manager the server doesn't have this passkey
   * (`signalUnknownCredential`, where the browser may be asked).
   */
  signalUnknownPasskey?: (rpId: string, credentialId: string) => void
  /** The RP ID this page's origin pairs with. */
  rpId: () => string
  /** This browser's label, sealed by the key: the passkey's and the session's. */
  label: (accountKey: Uint8Array) => string | undefined
  appVersion?: () => string | undefined
  mark: WebSignUpMarkStore
  lock: WebSignUpLock
  /** `navigator.onLine`: only then is a failed request "offline". */
  isOnline?: () => boolean
  randomBytes: (length: number) => Uint8Array
  /** Whether this page loaded Turnstile's script, which signing up reloads away. */
  pageNeedsReload?: () => boolean
  reload?: () => void
  onEvent?: (event: WebSignUpEvent) => void
}

const INITIAL: WebSignUpState = {
  ready: false,
  busy: false,
  problem: null,
  finishing: false,
  recoveryKey: null,
  finishStage: null,
  heldKey: null,
}

/** EdDSA, ES256, RS256 (docs/passkeys-protocol.md, "Ceremonies"). */
const ALGORITHMS = new Set([-8, -7, -257])
const USER_HANDLE_BYTES = 32
/** A challenge of at least 16 bytes, b64u. */
const CHALLENGE = /^[A-Za-z0-9_-]{22,}$/

const isUserHandle = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    const bytes = fromB64u(value)
    return bytes.length === USER_HANDLE_BYTES && toB64u(bytes) === value
  } catch {
    return false
  }
}

/**
 * The creation options the browser gets, made here: only the challenge, the
 * user and the algorithms come from the server, checked, and the rest is what
 * sign-up needs (docs/passkeys-protocol.md, "Ceremonies"). PRF is added by
 * `@/lib/passkeys`, and nothing else.
 */
export function signUpCreationOptions(
  answer: PasskeyChallenge & { userHandle: string },
  rpId: string
):
  | { ok: true; options: PublicKeyCredentialCreationOptionsJSON }
  | { ok: false } {
  const options = answer.options as Record<string, unknown>
  const user = (options.user ?? {}) as Record<string, unknown>
  const rp = (options.rp ?? {}) as Record<string, unknown>
  const { userHandle } = answer
  const name = isUserHandle(userHandle) ? passkeyName(userHandle) : null
  const params = Array.isArray(options.pubKeyCredParams)
    ? (options.pubKeyCredParams as Record<string, unknown>[]).filter(
        (param) =>
          param?.type === 'public-key' && ALGORITHMS.has(param.alg as number)
      )
    : []
  if (
    !name ||
    user.id !== userHandle ||
    user.name !== name ||
    user.displayName !== name ||
    rp.id !== rpId ||
    typeof options.challenge !== 'string' ||
    !CHALLENGE.test(options.challenge) ||
    params.length === 0
  )
    return { ok: false }
  return {
    ok: true,
    options: {
      challenge: options.challenge,
      rp: { id: rpId, name: 'WitnessWork' },
      user: { id: userHandle, name, displayName: name },
      pubKeyCredParams: params.map((param) => ({
        type: 'public-key',
        alg: param.alg as number,
      })),
      timeout: 300_000,
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
      attestation: 'none',
    },
  }
}

/** A thrown error as the screen explains it. */
export function webSignUpFailureFor(
  error: unknown,
  online = true
): {
  failure: WebSignUpFailure
  retryAfterMs: number | null
  /** For analytics: the finer reason, when there is one. */
  reason: WebSignUpFailureReason
} {
  const plain = (
    failure: WebSignUpFailure,
    reason: WebSignUpFailureReason = failure
  ) => ({ failure, retryAfterMs: null, reason })
  if (error instanceof PasskeyError)
    switch (error.code) {
      case 'cancelled':
      case 'timeout':
        return plain('cancelled', error.code)
      case 'not_supported':
        return plain('notSupported', error.code)
      default:
        return plain('passkeyFailed', error.code)
    }
  if (error instanceof WebSignInError)
    return plain(error.reason === 'storage' ? 'storage' : 'failed')
  if (error instanceof HttpError && error.serverCode === 'disabled')
    return plain('paused')
  const { failure, reason, retryAfterMs } = passkeyFailureFor(error)
  const result = (mapped: WebSignUpFailure) => ({
    failure: mapped,
    retryAfterMs,
    reason: reason ? (`${failure}:${reason}` as const) : failure,
  })
  if (error instanceof HttpError && error.serverCode === 'unavailable')
    return { ...result('unavailable'), reason: 'unavailable' }
  switch (failure) {
    case 'offline':
      // A reset connection looks the same as no network: only the browser
      // knows which.
      return online
        ? { ...result('unreachable'), reason: 'unreachable' }
        : result('offline')
    case 'updateRequired':
    case 'rateLimited':
    case 'turnstileFailed':
    case 'passkeyFailed':
      return result(failure)
    default:
      return result('failed')
  }
}

/**
 * `web/signup` refused in a way that says the account exists: `conflict` for
 * this key, the signed envelope's `replay`, or a used challenge.
 */
function lostAnswer(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false
  if (error.serverCode === 'conflict' || error.serverCode === 'replay')
    return true
  const { failure, reason } = passkeyFailureFor(error)
  return failure === 'passkeyFailed' && reason === 'challenge'
}

/**
 * The server answered, and made nothing: a refusal ahead of its one batch. A
 * server error or no answer at all leaves it unknown.
 */
const refused = (error: unknown) =>
  error instanceof HttpError &&
  error.status !== null &&
  ((error.status >= 400 && error.status < 500) ||
    (error.status === 503 && error.serverCode !== null))

/**
 * The server has no such passkey: it never stored it, or it was removed since.
 * Only that; `user_handle` means it found the passkey.
 */
function unknownPasskey(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false
  const { failure, reason } = passkeyFailureFor(error)
  return failure === 'passkeyFailed' && reason === 'unknown_credential'
}

/** The server found the passkey, for another user handle than its account's. */
function otherUserPasskey(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false
  const { failure, reason } = passkeyFailureFor(error)
  return failure === 'passkeyFailed' && reason === 'user_handle'
}

const publicKeyOf = (accountKey: Uint8Array) =>
  deriveAccountSigningKey(accountKey).publicKey

/** This sign-up, in this page: its key and what `web/signup` sends. */
type Attempt = {
  accountId: string
  accountKey: Uint8Array
  accountPub: string
  credentialId: string
  rpId: string
  signInOnly: boolean
  passkeyName: string
  /** Null once an answer said the account exists: the passkey finishes. */
  request: WebSignUpRequest | null
}

/** Why sign-up refused to start: there's something here it must not touch. */
class CantStart extends Error {
  constructor(
    readonly reason: 'keyPresent' | 'keptData' | 'markUnreadable',
    /** For `markUnreadable`: the key beside it. */
    readonly stored?: Uint8Array
  ) {
    super(`web sign-up: ${reason}`)
  }
}

export function createWebSignUp(deps: WebSignUpDeps) {
  let state: WebSignUpState = INITIAL
  const listeners = new Set<() => void>()
  let attempt: Attempt | null = null
  /**
   * `web/signup` went unanswered once: a later refusal no longer proves the
   * account wasn't made.
   */
  let unanswered = false
  const online = () => deps.isOnline?.() ?? true

  const set = (next: Partial<WebSignUpState>) => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  const emit = (event: WebSignUpEvent) => {
    try {
      deps.onEvent?.(event)
    } catch {
      // Analytics never stops a sign-up.
    }
  }

  function failed(
    step: WebSignUpStep,
    error: unknown,
    next: Partial<WebSignUpState> = {}
  ) {
    const { failure, retryAfterMs, reason } = webSignUpFailureFor(
      error,
      online()
    )
    emit({ type: 'failed', step, reason })
    // The prompt that saves the passkey closing is the end of this try.
    const shown: WebSignUpFailure =
      failure === 'cancelled' && step === 'create' ? 'passkeyNotSaved' : failure
    set({
      ...next,
      busy: false,
      problem: shown === 'cancelled' ? null : { failure: shown, retryAfterMs },
    })
  }

  function refuse(
    step: WebSignUpStep,
    failure: WebSignUpProblem['failure'],
    reason: WebSignUpFailureReason,
    next: Partial<WebSignUpState> = {}
  ) {
    emit({ type: 'failed', step, reason })
    set({ ...next, busy: false, problem: { failure, retryAfterMs: null } })
  }

  /** The key this browser holds, as the recovery key that signs in. */
  const held = (
    accountKey: Uint8Array,
    why: NonNullable<WebSignUpState['heldKey']>['why']
  ): WebSignUpState['heldKey'] => ({
    recoveryKey: encodeRecoveryKey(accountKey),
    why,
  })

  /** What the page shows once nothing is left to finish. */
  const finishedWith = (): Partial<WebSignUpState> => ({
    finishing: false,
    finishStage: null,
    heldKey: null,
  })

  const signalUnknown = (passkey: { rpId?: string; credentialId?: string }) => {
    if (!passkey.rpId || !passkey.credentialId) return
    try {
      deps.signalUnknownPasskey?.(passkey.rpId, passkey.credentialId)
    } catch {
      // The password manager keeps it; it signs in to nothing.
    }
  }

  /**
   * No account came of it, provably: deletes the key it made, then the mark (a
   * launch that finds the mark deletes the key again), and reports its passkey
   * unknown. Only for a key whose public key is the mark's.
   */
  async function forgetAttempt(
    accountKey: Uint8Array | null,
    passkey: { rpId?: string; credentialId?: string } = {}
  ) {
    attempt = null
    unanswered = false
    if (accountKey) await deps.accountKey.discard(accountKey)
    await deps.mark.write(null)
    signalUnknown(passkey)
  }

  /**
   * The account exists: the gate is marked first (it outlives a reload), then
   * the session opens.
   */
  async function created(
    done: Pick<Attempt, 'accountId' | 'accountPub' | 'signInOnly'> & {
      credentialId?: string
      rpId?: string
      passkeyName?: string
    },
    open: () => Promise<WebAccountSignIn>,
    finished: boolean
  ): Promise<void> {
    const mark: WebSignUpMark = {
      accountId: done.accountId,
      accountPub: done.accountPub,
      stage: 'created',
      ...(done.credentialId && { credentialId: done.credentialId }),
      ...(done.rpId && { rpId: done.rpId }),
      signInOnly: done.signInOnly,
      ...(done.passkeyName && { passkeyName: done.passkeyName }),
    }
    // A session left unkept would count against the account's three: it
    // opens even when the gate can't outlive a reload.
    await deps.mark.write(mark).catch(() => undefined)
    let reload: boolean
    try {
      ;({ reload } = await open())
    } catch (error) {
      // The account is there: the passkey finishes.
      if (attempt) attempt.request = null
      return failed('finish', error, {
        finishing: true,
        finishStage: 'created',
      })
    }
    attempt = null
    unanswered = false
    emit({ type: 'completed', prf: !done.signInOnly, finished })
    if (reload) {
      // Another account's data was wiped with the mark: once more, while
      // every tab reloads.
      await deps.mark.write(mark).catch(() => undefined)
      return
    }
    if (deps.pageNeedsReload?.()) {
      // The gate shows after the reload, away from Turnstile's script.
      deps.reload?.()
      return
    }
    set({
      ...finishedWith(),
      busy: false,
      problem: null,
      recoveryKey: { signInOnly: done.signInOnly },
    })
  }

  /** A get for the new passkey alone; its PRF output, or null. */
  async function confirmPrf(
    credentialId: string,
    rpId: string
  ): Promise<Uint8Array | null> {
    let assertion: PasskeyAssertion
    try {
      assertion = await deps.ceremonies.get(
        unlockRequest(deps, credentialId, rpId)
      )
    } catch {
      // Cancelled or failed: the passkey is made, and stays Sign-in only.
      return null
    }
    if (
      assertion.response.rawId !== credentialId ||
      assertion.prf?.length !== PRF_OUTPUT_BYTES
    ) {
      assertion.prf?.fill(0)
      return null
    }
    return assertion.prf
  }

  /** Sends `web/signup`, and keeps the session it answers with. */
  async function submit(current: Attempt, request: WebSignUpRequest) {
    let opened: OpenedSession & { credentialId: string }
    try {
      opened = await deps.server.signup(current.accountKey, request)
    } catch (error) {
      if (lostAnswer(error)) {
        current.request = null
        return finishWithPasskey()
      }
      if (!unanswered && refused(error)) {
        await forgetAttempt(current.accountKey, current).catch(() => undefined)
        return failed('signup', error, finishedWith())
      }
      unanswered = true
      return failed('signup', error, { finishing: true, finishStage: 'sent' })
    }
    if (
      opened.accountId !== current.accountId ||
      opened.credentialId !== current.credentialId
    ) {
      // Never kept, so never left open.
      void deps.server.closeOpened(opened.accessToken).catch(() => undefined)
      current.request = null
      return refuse('signup', 'failed', 'mismatch', {
        finishing: true,
        finishStage: 'sent',
      })
    }
    await created(
      current,
      () => deps.account.adoptSignupSession(current.accountKey, opened),
      false
    )
  }

  /**
   * Finishes a sign-up whose answer was lost: the passkey it made signs in, and
   * its ticket opens the session for the key this browser holds. Holds the
   * lock; reads the key from storage, never a tab's memory.
   */
  async function finishWithPasskey(): Promise<void> {
    let mark: WebSignUpMark | null
    let accountKey: Uint8Array | null
    try {
      mark = await deps.mark.read()
      accountKey = attempt?.accountKey ?? (await deps.accountKey.readStored())
    } catch (error) {
      return failed('finish', error, { finishing: true })
    }
    const accountPub = accountKey ? publicKeyOf(accountKey) : null
    if (
      !mark ||
      mark.stage === 'key' ||
      !accountKey ||
      accountPub !== mark.accountPub
    ) {
      attempt = null
      // Never sent: no account came of it.
      if (
        mark?.stage === 'key' &&
        accountKey &&
        accountPub === mark.accountPub
      ) {
        await forgetAttempt(accountKey, mark).catch(() => undefined)
        return refuse('finish', 'notCreated', 'notCreated', finishedWith())
      }
      // Storage holds no key, or another: nothing here can finish, and whether
      // the account exists isn't known, so nothing says it wasn't made.
      if (mark) await deps.mark.write(null).catch(() => undefined)
      return refuse('finish', 'failed', 'keyMissing', finishedWith())
    }
    const { accountId, credentialId } = mark
    const stage = mark.stage
    set({ finishStage: stage })
    try {
      const challenge = await deps.server.signInChallenge()
      const { challenge: value } = challenge.options as { challenge?: unknown }
      if (typeof value !== 'string' || value === '')
        return refuse('finish', 'failed', 'options', { finishing: true })
      // Only the challenge is the server's: the rest is this sign-in's own.
      const assertion = await deps.ceremonies.get({
        challenge: value,
        rpId: mark.rpId ?? deps.rpId(),
        userVerification: 'required',
        ...(credentialId && {
          allowCredentials: [{ id: credentialId, type: 'public-key' }],
        }),
        timeout: 300_000,
      })
      // The browser holds the key: no PRF output is needed.
      assertion.prf?.fill(0)
      const signIn = await deps.server.assert({
        challengeToken: challenge.challengeToken,
        response: assertion.response as unknown as PasskeyResponseJSON,
      })
      const ticket = signIn.ticket
      if (
        !ticket ||
        signIn.credentialId !== assertion.response.id ||
        signIn.accountId !== accountId ||
        signIn.accountPub !== accountPub
      )
        return refuse('finish', 'wrongPasskey', 'mismatch', {
          finishing: true,
        })
      const key = accountKey
      await created(
        {
          accountId,
          accountPub,
          credentialId: signIn.credentialId,
          rpId: mark.rpId,
          signInOnly: mark.signInOnly ?? false,
          passkeyName: mark.passkeyName,
        },
        () =>
          deps.account.openWebSessionWithTicket(ticket, key, {
            expectAccountId: accountId,
          }),
        true
      )
    } catch (error) {
      if (unknownPasskey(error)) {
        if (stage === 'created') {
          // The account exists; its passkey was removed since. The key stays,
          // and the recovery key signs in.
          emit({
            type: 'failed',
            step: 'finish',
            reason: 'passkeyFailed:unknown_credential',
          })
          return set({
            busy: false,
            finishing: true,
            problem: null,
            heldKey: held(accountKey, 'passkeyGone'),
          })
        }
        // `sent`: the server never stored the passkey, so never made the
        // account.
        await forgetAttempt(accountKey, mark).catch(() => undefined)
        return refuse('finish', 'notCreated', 'notCreated', finishedWith())
      }
      if (otherUserPasskey(error))
        // The server found the passkey: the account may well exist.
        return refuse('finish', 'wrongPasskey', 'passkeyFailed:user_handle', {
          finishing: true,
        })
      if (
        error instanceof PasskeyError &&
        (error.code === 'cancelled' || error.code === 'timeout')
      ) {
        emit({ type: 'failed', step: 'finish', reason: error.code })
        return set({
          busy: false,
          finishing: true,
          problem: {
            failure: 'pickPasskey',
            retryAfterMs: null,
            ...(mark.passkeyName && { passkeyName: mark.passkeyName }),
          },
        })
      }
      failed('finish', error, { finishing: true })
    }
  }

  /**
   * What an earlier sign-up left, before a new one: a sign-up to finish (its
   * stage), or room to start (false). Throws `CantStart` when a key, a mark or
   * data is here that sign-up must not touch. Holds the lock.
   */
  async function clearForSignUp(): Promise<false | 'sent' | 'created'> {
    let owner: string | null
    try {
      owner = await deps.owner.read()
    } catch {
      throw new CantStart('keptData')
    }
    if (owner !== null && owner !== '') throw new CantStart('keptData')
    let mark: WebSignUpMark | null
    let unreadable = false
    try {
      mark = await deps.mark.read()
    } catch {
      mark = null
      unreadable = true
    }
    if (mark && mark.stage !== 'key') return mark.stage
    // Storage, not memory: another tab may have stored a key since launch.
    const stored = await deps.accountKey.readStored()
    if (stored) {
      if (unreadable) throw new CantStart('markUnreadable', stored)
      if (!mark || publicKeyOf(stored) !== mark.accountPub)
        throw new CantStart('keyPresent')
      await forgetAttempt(stored, mark)
    } else if (mark || unreadable) await deps.mark.write(null)
    return false
  }

  /** The sign-up itself, holding the lock. */
  async function run(turnstileToken: string): Promise<void> {
    let step: WebSignUpStep = 'options'
    let accountKey: Uint8Array | null = null
    let passkey: { rpId?: string; credentialId?: string } = {}
    let prf: Uint8Array | null = null
    let current: Attempt
    let request: WebSignUpRequest
    try {
      const left = await clearForSignUp()
      if (left)
        return set({
          busy: false,
          finishing: true,
          finishStage: left,
          heldKey: null,
        })

      const answer = await deps.server.options(turnstileToken)
      const rpId = deps.rpId()
      const built = signUpCreationOptions(answer, rpId)
      if (!built.ok) return refuse('options', 'failed', 'options')
      const { accountId } = answer

      step = 'key'
      accountKey = await deps.accountKey.create()
      const accountPub = publicKeyOf(accountKey)
      await deps.mark.write({ accountId, accountPub, stage: 'key' })

      step = 'create'
      const made = await deps.ceremonies.create(built.options)
      made.prf.first?.fill(0)
      const credentialId = made.response.rawId
      passkey = { rpId, credentialId }
      const name = passkeyName(answer.userHandle)
      // A reload from here deletes the key, and reports the passkey unknown.
      await deps.mark.write({
        accountId,
        accountPub,
        stage: 'key',
        credentialId,
        rpId,
        passkeyName: name,
      })
      prf =
        made.prf.enabled === false ? null : await confirmPrf(credentialId, rpId)
      const wrap = prf && {
        wrapId: newPasskeyWrapId(deps.randomBytes),
        wrap: wrapAccountKey(
          {
            prfOutput: prf,
            accountKey,
            accountId,
            credentialId,
            keyEpoch: 0,
          },
          deps.randomBytes(24)
        ),
      }
      prf?.fill(0)
      prf = null

      const label = deps.label(accountKey)
      request = {
        challengeToken: answer.challengeToken,
        response: made.response as unknown as PasskeyResponseJSON,
        ...wrap,
        ...(label !== undefined && { label, device: label }),
        appVersion: deps.appVersion?.(),
      }
      attempt = current = {
        accountId,
        accountKey,
        accountPub,
        credentialId,
        rpId,
        signInOnly: !wrap,
        passkeyName: name,
        request,
      }
      step = 'signup'
      // Before it's sent: from here, the account may exist.
      await deps.mark.write({
        accountId,
        accountPub,
        stage: 'sent',
        credentialId,
        rpId,
        signInOnly: !wrap,
        passkeyName: name,
      })
    } catch (error) {
      prf?.fill(0)
      if (error instanceof CantStart && error.stored) {
        // Its own state: the key it holds settles it.
        emit({ type: 'failed', step: 'options', reason: error.reason })
        return set({ busy: false, heldKey: held(error.stored, 'unreadable') })
      }
      if (error instanceof CantStart)
        return refuse('options', 'failed', error.reason)
      // Only a key this sign-up made in this try is deleted.
      if (accountKey)
        await forgetAttempt(accountKey, passkey).catch(() => undefined)
      return failed(step, error)
    }
    await submit(current, request)
  }

  /**
   * Signs up with Turnstile's `turnstileToken` (used once; the screen resets
   * its widget after any attempt that didn't sign up). Only while this browser
   * is signed out and keeps no account's data, and no other tab signs up.
   */
  async function signUp(turnstileToken: string): Promise<void> {
    if (state.busy || state.finishing || state.recoveryKey) return
    set({ busy: true, problem: null })
    emit({ type: 'started' })
    if (deps.account.state().status !== 'signedOut')
      return refuse('options', 'failed', 'keptData')
    try {
      const held = await deps.lock(() => run(turnstileToken))
      if (!held) refuse('options', 'otherTab', 'otherTab')
    } catch (error) {
      failed('options', error)
    }
  }

  /**
   * Finish, while the outcome isn't known: sends `web/signup` again while this
   * page still has it, or signs in with the passkey it made.
   */
  async function finish(): Promise<void> {
    if (state.busy || !state.finishing) return
    set({ busy: true, problem: null })
    try {
      const held = await deps.lock(() =>
        attempt?.request
          ? submit(attempt, attempt.request)
          : finishWithPasskey()
      )
      if (!held) refuse('finish', 'otherTab', 'otherTab', { finishing: true })
    } catch (error) {
      failed('finish', error, { finishing: true })
    }
  }

  /**
   * "I deleted that passkey", once Finish's prompt closed: the key this browser
   * holds, checked fresh against the mark, signs in as the recovery key
   * instead. Never a silent Finish: a key that's missing or another's clears
   * the mark (`keyMissing`), and storage that can't be read says so.
   */
  async function passkeyIsGone(): Promise<void> {
    if (state.busy || !state.finishing) return
    set({ busy: true, problem: null })
    try {
      const got = await deps.lock(async () => {
        const mark = await deps.mark.read()
        const stored = await deps.accountKey.readStored()
        if (!mark || mark.stage === 'key') {
          attempt = null
          return refuse('finish', 'notCreated', 'notCreated', finishedWith())
        }
        if (!stored || publicKeyOf(stored) !== mark.accountPub) {
          attempt = null
          await deps.mark.write(null).catch(() => undefined)
          return refuse('finish', 'failed', 'keyMissing', finishedWith())
        }
        set({
          busy: false,
          finishStage: mark.stage,
          heldKey: held(
            stored,
            mark.stage === 'created' ? 'passkeyGone' : 'mayExist'
          ),
        })
      })
      if (!got) refuse('finish', 'otherTab', 'otherTab', { finishing: true })
    } catch (error) {
      failed('finish', error, { finishing: true, heldKey: null })
    }
  }

  /**
   * The held key's recovery-key sign-in said no account has it
   * (`unknownAccount`): its sign-up never made one, so the key and the mark go,
   * and the passkey is reported unknown. Only for the key stored now, and never
   * beside a `created` mark, which proves the account.
   */
  async function forgetUnknownAccount(accountKey: Uint8Array): Promise<void> {
    if (state.busy) return
    set({ busy: true })
    try {
      await deps.lock(async () => {
        let mark: WebSignUpMark | null = null
        try {
          mark = await deps.mark.read()
        } catch {
          // Unreadable: the key decides.
        }
        const stored = await deps.accountKey.readStored()
        if (
          mark?.stage === 'created' ||
          !stored ||
          !sameBytes(stored, accountKey)
        )
          return set({ busy: false })
        await forgetAttempt(stored, mark ?? {})
        refuse('finish', 'notCreated', 'notCreated', finishedWith())
      })
    } catch (error) {
      failed('finish', error)
    }
    if (state.busy) set({ busy: false })
  }

  /**
   * After a launch and whenever the account changes: signed in as the account
   * this browser just made, the recovery key's gate; signed out, a sign-up to
   * finish, or a key that provably never became an account, deleted (only by
   * the tab that gets the lock, so never one another tab is making).
   */
  async function resume(accountId: string | null): Promise<void> {
    // A sign-up in this page is its own state.
    if (state.busy || attempt) return set({ ready: true })
    let mark: WebSignUpMark | null = null
    try {
      mark = await deps.mark.read()
    } catch {
      return resumeUnreadable(accountId)
    }
    if (accountId !== null) {
      if (mark?.accountId === accountId && mark.stage !== 'key')
        return set({
          ...finishedWith(),
          ready: true,
          recoveryKey: { signInOnly: mark.signInOnly ?? false },
        })
      // Another account signed in: that sign-up is over.
      if (mark) await deps.mark.write(null).catch(() => undefined)
      return set({ ...finishedWith(), ready: true, recoveryKey: null })
    }
    if (mark?.stage === 'key') {
      await deps
        .lock(async () => {
          // Read again: the tab that held the lock may have moved on.
          const now = await deps.mark.read()
          if (now?.stage !== 'key') return
          const stale = await deps.accountKey.readStored()
          if (stale && publicKeyOf(stale) === now.accountPub)
            await forgetAttempt(stale, now)
          else await deps.mark.write(null)
        })
        .catch(() => undefined)
      return set({ ...finishedWith(), ready: true, recoveryKey: null })
    }
    set({
      ready: true,
      finishing: mark !== null,
      finishStage: mark?.stage ?? null,
      heldKey: null,
      recoveryKey: null,
    })
  }

  /**
   * An unreadable mark. Signed in, the key here is that account's: it's
   * settled. Signed out, a key beside it may be an account's, so the browser
   * shows it as the recovery key that settles it; with no key in storage
   * there's nothing to lose, and the mark goes.
   */
  async function resumeUnreadable(accountId: string | null): Promise<void> {
    const plain = { ...finishedWith(), ready: true, recoveryKey: null }
    if (accountId !== null) {
      await deps.mark.write(null).catch(() => undefined)
      return set(plain)
    }
    let stored: Uint8Array | null
    try {
      stored = await deps.accountKey.readStored()
    } catch {
      // Can't tell: nothing here touches it.
      return set(plain)
    }
    if (stored) return set({ ...plain, heldKey: held(stored, 'unreadable') })
    await deps
      .lock(async () => {
        if (!(await deps.accountKey.readStored())) await deps.mark.write(null)
      })
      .catch(() => undefined)
    set(plain)
  }

  /** "I've saved my recovery key": the gate opens, for good. */
  async function confirmRecoveryKey(): Promise<void> {
    await deps.mark.write(null).catch(() => undefined)
    emit({ type: 'recoveryKeySaved' })
    set({ recoveryKey: null })
  }

  return {
    state: (): WebSignUpState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    signUp,
    finish,
    passkeyIsGone,
    forgetUnknownAccount,
    resume,
    confirmRecoveryKey,
    /** The User went back, or the browser came back online: the problem goes. */
    clearProblem: () => set({ problem: null }),
  }
}

export type WebSignUp = ReturnType<typeof createWebSignUp>
