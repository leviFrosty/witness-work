import { PasskeyError, type PasskeyErrorCode } from '@/lib/passkeys/errors'
import type {
  PasskeyAssertion,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'
import type {
  ApprovalFailure,
  BrowserApproval,
} from '@/lib/serverAccount/approvalSession'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  type PasskeyChallenge,
  type PasskeyFailure,
  passkeyFailureFor,
  type PasskeyResponseJSON,
  type PasskeySignIn,
  type WebTicket,
} from '@/lib/serverAccount/passkeyClient'
import {
  newPasskeyWrapId,
  openPasskeyWraps,
  type PasskeyUnlockProblem,
  type PasskeyWrap,
  wrapAccountKey,
} from '@/lib/serverAccount/passkeys'
import type { SessionEndReason } from '@/lib/serverAccount/session'
import { type WebAccount, WebSignInError } from '@/lib/serverAccount/webAccount'
import type {
  WebSignInMark,
  WebSignInMarkStore,
} from '@/lib/serverAccount/webSignInMark'

/**
 * A browser's sign-in screen (docs/passkeys-protocol.md, "The app" → "Signing
 * in"; ADR 0038 §6), as a state machine the screen drives. Three ways, in this
 * order:
 *
 * 1. **A passkey:** `passkeys/challenge`, the browser's get with PRF,
 *    `passkeys/assert`, then the wraps. One that opens to the account's key
 *    signs in with the passkey's ticket. One that signs in but can't unlock
 *    keeps the account, its ticket, the credential and the PRF output in
 *    memory, and the next two finish: the key they bring must be that
 *    account's, and once the session is open the browser saves a wrap for this
 *    passkey (`passkeys/wrap`), so it unlocks next time.
 * 2. **Use my phone:** the approval QR (`approvalSession.ts`). Once the key
 *    arrives, the session opens with its ticket for the sealed account, the
 *    channel is done, and the screen shows "Approved by …" with That Wasn't Me
 *    until the User continues.
 * 3. **A recovery key,** checked locally first, then `web/recovery` with the
 *    Turnstile token. A passkey's ticket still within its 2 minutes opens the
 *    session instead, with no check (`recoveryNeedsCheck` turns true as it runs
 *    out).
 *
 * Signing in as another account than this browser's data wipes and reloads
 * every tab (`webAccount`), and a page that loaded Turnstile's script reloads
 * too, so it doesn't stay in the signed-in app. What must outlive that (a wrap
 * to save, "Approved by") is written to the tab's mark first, and `resume`
 * finishes it after the reload.
 */

export type WebSignInMethod = 'passkey' | 'phone' | 'recovery'

/** Why a sign-in didn't finish, as the screen explains it. */
export type WebSignInFailure =
  /** The User closed the browser's passkey prompt. Shown as nothing. */
  | 'cancelled'
  /** This browser can't use passkeys. */
  | 'notSupported'
  /** No passkey here, or one the account no longer has. */
  | 'noPasskey'
  /** The passkey didn't verify. */
  | 'passkeyFailed'
  /** The key is another account's than the one signing in. */
  | 'wrongAccount'
  /** No account has this recovery key: the web doesn't create one from it. */
  | 'unknownAccount'
  /** The account key changed since (ADR 0039): this one no longer signs in. */
  | 'keyRetired'
  /** The security check (Turnstile) refused. */
  | 'turnstileFailed'
  /** The passkey's ticket ran out: the recovery key needs the check now. */
  | 'checkNeeded'
  /** Too many tries: `retryAfterMs` says when to try again, when known. */
  | 'rateLimited'
  /** The sign-in took too long and its ticket expired. */
  | 'expired'
  | 'offline'
  /** Accounts are off on the server. */
  | 'unavailable'
  | 'updateRequired'
  /** This browser couldn't store the key or the session. */
  | 'storage'
  | 'failed'

export type WebSignInProblem = {
  method: WebSignInMethod
  failure: WebSignInFailure
  retryAfterMs: number | null
}

export type WebSignInState = {
  /** The way that's running. */
  busy: WebSignInMethod | null
  problem: WebSignInProblem | null
  /**
   * A passkey signed in but can't unlock this account here: the phone or the
   * recovery key finishes. `prf` when it gave PRF output, so finishing lets it
   * unlock next time.
   */
  cantUnlock: { reason: PasskeyUnlockProblem; prf: boolean } | null
  /** Signed in by this phone: "Approved by …" until the User continues. */
  approvedBy: string | null
  /**
   * Signed in on this page (or a reload ago): the web's Cloud Sync screen
   * checks the account before the app opens (ADR 0040 §5).
   */
  cloudSync: boolean
  /**
   * Whether the recovery key needs the security check: not while a passkey's
   * ticket can still open the session.
   */
  recoveryNeedsCheck: boolean
  /**
   * After "Approved by …": opening the session still counts as the step-up Add
   * a Passkey needs (docs/passkeys-protocol.md, "Step-up on the web").
   */
  canAddPasskey: boolean
  /** Whether the passkey that couldn't unlock now can, once known. */
  wrapSaved: boolean | null
  /** Why the server signed this browser out, when it wiped (a reload ago). */
  ended: SessionEndReason | null
}

/** What analytics records; no ids, keys or names. */
export type WebSignInEvent =
  | { type: 'started'; method: WebSignInMethod }
  | {
      type: 'succeeded'
      method: WebSignInMethod
      /** A passkey signed in first but couldn't unlock. */
      afterPasskey: boolean
      /** `pending`: saved after every tab reloads into the account. */
      wrap: 'saved' | 'failed' | 'none' | 'pending'
    }
  | { type: 'failed'; method: WebSignInMethod; reason: WebSignInFailureReason }
  | { type: 'cantUnlock'; reason: PasskeyUnlockProblem; prf: boolean }
  | { type: 'thatWasntMe' }

/**
 * Analytics' `reason` for a failed sign-in (docs/analytics.md): the failure,
 * the browser passkey prompt's error code, the server's failure (with its finer
 * reason after a colon, `passkeyFailed:signature`), `credential` for an
 * assertion of another credential than the server verified, or why the phone's
 * code stopped.
 */
export type WebSignInFailureReason =
  | WebSignInFailure
  | PasskeyErrorCode
  | PasskeyFailure
  | `${PasskeyFailure}:${string}`
  | 'credential'
  | ApprovalFailure

export type WebSignInDeps = {
  account: Pick<WebAccount, 'openWebSessionWithTicket' | 'signOut'>
  passkeys: {
    /** `passkeys/challenge` for a sign-in. */
    challenge: () => Promise<PasskeyChallenge>
    /** The browser's get, with the PRF salt (`@/lib/passkeys`). */
    get: (
      options: PublicKeyCredentialRequestOptionsJSON
    ) => Promise<PasskeyAssertion>
    /** `passkeys/assert`. */
    assert: (args: {
      challengeToken: string
      response: PasskeyResponseJSON
    }) => Promise<PasskeySignIn>
    /** `passkeys/wrap`, as the session `accountKey` just opened. */
    saveWrap: (
      accountKey: Uint8Array,
      wrap: PasskeyWrap & { credentialId: string }
    ) => Promise<void>
  }
  /** `web/recovery`, signed by the key, with Turnstile's token. */
  recovery: (
    accountKey: Uint8Array,
    turnstileToken: string
  ) => Promise<WebTicket>
  /** A new browser approval (`createBrowserApproval`), not started. */
  createApproval: () => BrowserApproval
  /** This browser's account key once signed in, for `resume`. */
  accountKey: () => Promise<Uint8Array | null>
  mark: WebSignInMarkStore
  randomBytes: (length: number) => Uint8Array
  /** The server's clock (`syncNow`): tickets and step-ups expire on it. */
  now: () => number
  /** Runs `run` in `ms`; returns a cancel. `setTimeout` by default. */
  schedule?: (run: () => void, ms: number) => () => void
  /** Whether this page loaded Turnstile's script, which signing in reloads away. */
  pageNeedsReload?: () => boolean
  reload?: () => void
  onEvent?: (event: WebSignInEvent) => void
}

/** A passkey's ticket this close to expiring isn't worth trying. */
const TICKET_MARGIN_MS = 5_000

/** How long opening a web session counts as a step-up (the server's). */
export const STEP_UP_WINDOW_MS = 5 * 60_000

/**
 * The passkey prompt's time: Add a Passkey goes this long before the window
 * ends.
 */
const STEP_UP_MARGIN_MS = 60_000

const scheduleTimeout = (run: () => void, ms: number) => {
  const timer = setTimeout(run, ms)
  return () => clearTimeout(timer)
}

/** The passkey that signed in but can't unlock, until the key arrives. */
type Pending = {
  accountId: string
  accountPub: string
  credentialId: string
  keyEpoch: number
  prf: Uint8Array | null
  ticket: string | null
  ticketExpiresAt: number
}

const INITIAL: WebSignInState = {
  busy: null,
  problem: null,
  cantUnlock: null,
  approvedBy: null,
  cloudSync: false,
  recoveryNeedsCheck: true,
  canAddPasskey: false,
  wrapSaved: null,
  ended: null,
}

/** A thrown error as the screen explains it. */
export function webSignInFailureFor(error: unknown): {
  failure: WebSignInFailure
  retryAfterMs: number | null
  /** For analytics: the finer reason, when there is one. */
  reason: WebSignInFailureReason
} {
  const plain = (
    failure: WebSignInFailure,
    reason: WebSignInFailureReason = failure
  ) => ({
    failure,
    retryAfterMs: null,
    reason,
  })
  if (error instanceof PasskeyError)
    switch (error.code) {
      case 'cancelled':
      case 'timeout':
        return plain('cancelled', error.code)
      case 'not_supported':
        return plain('notSupported')
      case 'no_credentials':
        return plain('noPasskey', 'no_credentials')
      default:
        return plain('passkeyFailed', error.code)
    }
  if (error instanceof WebSignInError) return plain(error.reason)
  const { failure, reason, retryAfterMs } = passkeyFailureFor(error)
  const result = (mapped: WebSignInFailure) => ({
    failure: mapped,
    retryAfterMs,
    reason: reason ? (`${failure}:${reason}` as const) : failure,
  })
  switch (failure) {
    case 'offline':
    case 'unavailable':
    case 'updateRequired':
    case 'rateLimited':
    case 'turnstileFailed':
    case 'unknownAccount':
    case 'keyRetired':
      return result(failure)
    case 'passkeyFailed':
      return result(
        reason === 'unknown_credential' || reason === 'user_handle'
          ? 'noPasskey'
          : 'passkeyFailed'
      )
    case 'ticketInvalid':
      return result('expired')
    default:
      return result('failed')
  }
}

export function createWebSignIn(deps: WebSignInDeps) {
  let state: WebSignInState = INITIAL
  const listeners = new Set<() => void>()
  let pending: Pending | null = null
  let approval: BrowserApproval | null = null
  let stopApproval: (() => void) | null = null
  const schedule = deps.schedule ?? scheduleTimeout
  /** Turns `recoveryNeedsCheck` back on as the pending ticket runs out. */
  let cancelTicketTimer: (() => void) | null = null
  /** When Add a Passkey stops (server clock), and its timer. */
  let stepUpUntil = 0
  let cancelStepUpTimer: (() => void) | null = null

  const set = (next: Partial<WebSignInState>) => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  const emit = (event: WebSignInEvent) => {
    try {
      deps.onEvent?.(event)
    } catch {
      // Analytics never stops a sign-in.
    }
  }

  function begin(method: WebSignInMethod): boolean {
    if (state.busy) return false
    set({ busy: method, problem: null })
    emit({ type: 'started', method })
    return true
  }

  function failed(method: WebSignInMethod, error: unknown) {
    const { failure, retryAfterMs, reason } = webSignInFailureFor(error)
    emit({ type: 'failed', method, reason })
    set({
      busy: null,
      problem:
        failure === 'cancelled' ? null : { method, failure, retryAfterMs },
    })
  }

  function refuse(
    method: WebSignInMethod,
    failure: Exclude<WebSignInFailure, 'cancelled'>,
    reason: WebSignInFailureReason = failure
  ) {
    emit({ type: 'failed', method, reason })
    set({ busy: null, problem: { method, failure, retryAfterMs: null } })
  }

  /** The pending passkey's ticket can't open the session any more. */
  function ticketGone() {
    cancelTicketTimer?.()
    cancelTicketTimer = null
    if (pending) pending.ticket = null
    set({ recoveryNeedsCheck: true })
  }

  /** Keeps a passkey that signed in but can't unlock, and times its ticket. */
  function keepPending(next: Pending) {
    forgetPasskey()
    pending = next
    const left = next.ticketExpiresAt - TICKET_MARGIN_MS - deps.now()
    if (!next.ticket || left <= 0) return ticketGone()
    cancelTicketTimer = schedule(ticketGone, left)
    set({ recoveryNeedsCheck: false })
  }

  /** Forgets the pending passkey, its PRF output zeroed first. */
  function forgetPasskey() {
    cancelTicketTimer?.()
    cancelTicketTimer = null
    pending?.prf?.fill(0)
    pending = null
    if (state.cantUnlock || !state.recoveryNeedsCheck)
      set({ cantUnlock: null, recoveryNeedsCheck: true })
  }

  /**
   * Add a Passkey, while the session's opening at `openedAt` counts as a
   * step-up.
   */
  function stepUpFrom(openedAt: number | undefined) {
    cancelStepUpTimer?.()
    cancelStepUpTimer = null
    stepUpUntil =
      openedAt === undefined
        ? 0
        : openedAt + STEP_UP_WINDOW_MS - STEP_UP_MARGIN_MS
    const left = stepUpUntil - deps.now()
    if (left <= 0) return set({ canAddPasskey: false })
    cancelStepUpTimer = schedule(() => set({ canAddPasskey: false }), left)
    set({ canAddPasskey: true })
  }

  /** The key the phone or recovery key brought must be the passkey's account's. */
  const othersKey = (accountKey: Uint8Array) =>
    pending !== null &&
    deriveAccountSigningKey(accountKey).publicKey !== pending.accountPub

  /** The pending passkey's wrap of `accountKey`, when it gave PRF output. */
  function pendingWrap(
    accountKey: Uint8Array,
    accountId: string
  ): WebSignInMark['wrap'] | undefined {
    if (!pending?.prf || pending.accountId !== accountId) return undefined
    const { credentialId, keyEpoch } = pending
    return {
      accountId,
      credentialId,
      keyEpoch,
      wrapId: newPasskeyWrapId(deps.randomBytes),
      wrap: wrapAccountKey(
        {
          prfOutput: pending.prf,
          accountKey,
          accountId,
          credentialId,
          keyEpoch,
        },
        deps.randomBytes(24)
      ),
    }
  }

  /**
   * Saves the marked wrap, once `accountId`'s session is open; then forgets it.
   * A wrap for another account is dropped unsaved.
   */
  async function saveMarkedWrap(
    accountKey: Uint8Array,
    accountId: string
  ): Promise<'saved' | 'failed' | 'none'> {
    const wrap = deps.mark.read()?.wrap
    if (!wrap) return 'none'
    const forget = () => {
      const { wrap: _, ...rest } = deps.mark.read() ?? {}
      deps.mark.write(rest)
    }
    if (wrap.accountId !== accountId) {
      forget()
      return 'none'
    }
    let outcome: 'saved' | 'failed'
    try {
      const { accountId: _, ...saved } = wrap
      await deps.passkeys.saveWrap(accountKey, saved)
      outcome = 'saved'
    } catch {
      // The passkey stays Sign-in only; it signs in all the same.
      outcome = 'failed'
    }
    forget()
    set({ wrapSaved: outcome === 'saved' })
    return outcome
  }

  /**
   * Opens the session with a ticket. Returns false when this page is reloading:
   * into another account (every tab), or away from Turnstile's script. The flow
   * stops there, and `resume` finishes it. `onStored` runs once the key is
   * stored, before any reload (an approval's `done`).
   */
  async function open(
    method: WebSignInMethod,
    ticket: string,
    accountKey: Uint8Array,
    accountId: string,
    phone?: { deviceName: string; onStored: () => Promise<void> }
  ): Promise<boolean> {
    const afterPasskey = pending !== null && method !== 'passkey'
    const wrap = pendingWrap(accountKey, accountId)
    // Before the session opens, so the step-up window it starts is never
    // longer here than on the server.
    const openedAt = deps.now()
    deps.mark.write({
      ...(phone && { approvedBy: phone.deviceName, openedAt }),
      ...(wrap && { wrap }),
      cloudSync: true,
    })
    let reload: boolean
    try {
      ;({ reload } = await deps.account.openWebSessionWithTicket(
        ticket,
        accountKey,
        { expectAccountId: accountId, onStored: phone?.onStored }
      ))
    } catch (error) {
      deps.mark.write(null)
      throw error
    }
    forgetPasskey()
    if (reload || deps.pageNeedsReload?.()) {
      emit({
        type: 'succeeded',
        method,
        afterPasskey,
        wrap: wrap ? 'pending' : 'none',
      })
      if (!reload) deps.reload?.()
      return false
    }
    const saved = await saveMarkedWrap(accountKey, accountId)
    emit({ type: 'succeeded', method, afterPasskey, wrap: saved })
    set({ busy: null, approvedBy: phone?.deviceName ?? null, cloudSync: true })
    if (phone) stepUpFrom(openedAt)
    return true
  }

  // --- A passkey ------------------------------------------------------------

  async function signInWithPasskey(): Promise<void> {
    if (!begin('passkey')) return
    // Another passkey replaces one that couldn't unlock.
    forgetPasskey()
    try {
      const challenge = await deps.passkeys.challenge()
      const assertion = await deps.passkeys.get(
        challenge.options as unknown as PublicKeyCredentialRequestOptionsJSON
      )
      const signIn = await deps.passkeys.assert({
        challengeToken: challenge.challengeToken,
        response: assertion.response as unknown as PasskeyResponseJSON,
      })
      if (!signIn.ticket) throw new Error('No ticket for a browser')
      // The server verified the credential the browser used, or something is
      // wrong.
      if (signIn.credentialId !== assertion.response.id) {
        assertion.prf?.fill(0)
        return refuse('passkey', 'passkeyFailed', 'credential')
      }
      const unlock = openPasskeyWraps({
        prfOutput: assertion.prf,
        accountId: signIn.accountId,
        accountPub: signIn.accountPub,
        credentialId: signIn.credentialId,
        keyEpoch: signIn.keyEpoch,
        wraps: signIn.wraps,
      })
      if (unlock.ok) {
        assertion.prf?.fill(0)
        await open(
          'passkey',
          signIn.ticket,
          unlock.accountKey,
          signIn.accountId
        )
        return
      }
      keepPending({
        accountId: signIn.accountId,
        accountPub: signIn.accountPub,
        credentialId: signIn.credentialId,
        keyEpoch: signIn.keyEpoch,
        prf: assertion.prf,
        ticket: signIn.ticket,
        ticketExpiresAt: signIn.ticketExpiresAt ?? 0,
      })
      emit({
        type: 'cantUnlock',
        reason: unlock.reason,
        prf: assertion.prf !== null,
      })
      set({
        busy: null,
        cantUnlock: { reason: unlock.reason, prf: assertion.prf !== null },
      })
    } catch (error) {
      failed('passkey', error)
    }
  }

  // --- A recovery key -------------------------------------------------------

  /** A pending passkey's ticket, while it still has time left. */
  function pendingTicket() {
    if (!pending?.ticket) return null
    if (deps.now() < pending.ticketExpiresAt - TICKET_MARGIN_MS)
      return { ticket: pending.ticket, accountId: pending.accountId }
    // A timer that ran late, in a background tab.
    ticketGone()
    return null
  }

  /**
   * Signs in with a recovery key the screen already checked
   * (`parseRecoveryKey`). `turnstileToken` is used once; the screen resets its
   * widget after any attempt that didn't sign in.
   */
  async function signInWithRecoveryKey(
    accountKey: Uint8Array,
    turnstileToken: string | null
  ): Promise<void> {
    if (!begin('recovery')) return
    if (othersKey(accountKey)) return refuse('recovery', 'wrongAccount')
    try {
      const fromPasskey = pendingTicket()
      if (fromPasskey)
        try {
          await open(
            'recovery',
            fromPasskey.ticket,
            accountKey,
            fromPasskey.accountId
          )
          return
        } catch (error) {
          // Expired meanwhile: the security check's ticket still can.
          if (webSignInFailureFor(error).failure !== 'expired') throw error
          ticketGone()
        }
      if (!turnstileToken) return refuse('recovery', 'checkNeeded')
      const { ticket, accountId } = await deps.recovery(
        accountKey,
        turnstileToken
      )
      if (pending && accountId !== pending.accountId)
        return refuse('recovery', 'wrongAccount')
      await open('recovery', ticket, accountKey, accountId)
    } catch (error) {
      failed('recovery', error)
    }
  }

  // --- Use my phone ---------------------------------------------------------

  async function received(current: BrowserApproval) {
    const step = current.state
    if (step.step !== 'received' || approval !== current) return
    const { accountKey, accountId, deviceName, ticket } = step.received
    set({ busy: 'phone', problem: null })
    if (othersKey(accountKey) || (pending && pending.accountId !== accountId)) {
      void current.cancel()
      return refuse('phone', 'wrongAccount')
    }
    try {
      await open('phone', ticket, accountKey, accountId, {
        deviceName,
        // The key is stored: the server can drop it, before any reload.
        onStored: () => current.finish(),
      })
    } catch (error) {
      current.fail(
        error instanceof WebSignInError && error.reason === 'wrongAccount'
          ? 'tampered'
          : 'server'
      )
      failed('phone', error)
    }
  }

  function approvalFailed(current: BrowserApproval) {
    const step = current.state
    if (step.step !== 'failed' || approval !== current || state.busy) return
    emit({ type: 'failed', method: 'phone', reason: step.reason })
  }

  /** Use my phone: a new approval, started; the screen shows its state. */
  function startPhone(): BrowserApproval {
    if (approval && !['cancelled', 'failed'].includes(approval.state.step))
      return approval
    stopPhone()
    const next = deps.createApproval()
    approval = next
    let last = next.state.step
    stopApproval = next.subscribe(() => {
      if (next.state.step === last) return
      last = next.state.step
      if (last === 'received') void received(next)
      if (last === 'failed') approvalFailed(next)
    })
    emit({ type: 'started', method: 'phone' })
    void next.start()
    return next
  }

  /** The User left the phone's code: its channels end. */
  function stopPhone() {
    stopApproval?.()
    stopApproval = null
    const current = approval
    approval = null
    // Never while the session opens with its key.
    if (current && current.state.step !== 'received') current.dispose()
  }

  // --- After signing in -----------------------------------------------------

  /**
   * After a launch: a reload's sign-in finishes (the wrap, "Approved by"), and
   * the reason the server signed this browser out shows once.
   */
  async function resume(accountId: string | null): Promise<void> {
    const mark = deps.mark.read()
    if (!mark) return
    if (accountId === null) {
      deps.mark.write(null)
      set({ ended: mark.ended ?? null })
      return
    }
    if (mark.ended) {
      const { ended: _, ...rest } = mark
      deps.mark.write(rest)
    }
    if (mark.approvedBy !== undefined) {
      set({ approvedBy: mark.approvedBy })
      stepUpFrom(mark.openedAt)
    }
    if (mark.cloudSync) set({ cloudSync: true })
    if (mark.wrap) {
      const accountKey = await deps.accountKey()
      if (accountKey) await saveMarkedWrap(accountKey, accountId)
    }
  }

  /** Past "Approved by …": into the app. */
  function dismissApproved() {
    const { approvedBy: _, openedAt: __, ...rest } = deps.mark.read() ?? {}
    deps.mark.write(rest)
    stepUpFrom(undefined)
    set({ approvedBy: null })
  }

  /** The Cloud Sync screen let the app open. */
  function cloudSyncChecked() {
    const { cloudSync: _, ...rest } = deps.mark.read() ?? {}
    deps.mark.write(rest)
    set({ cloudSync: false })
  }

  /** That Wasn't Me: signs out and erases this browser. */
  async function thatWasntMe(): Promise<void> {
    emit({ type: 'thatWasntMe' })
    deps.mark.write(null)
    await deps.account.signOut()
  }

  /** The User went back: the problem shown goes. */
  const clearProblem = () => set({ problem: null })

  /**
   * The sign-in screen went: the phone's channels end, the passkey is
   * forgotten.
   */
  function leave() {
    stopPhone()
    forgetPasskey()
  }

  return {
    state: (): WebSignInState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    signInWithPasskey,
    signInWithRecoveryKey,
    startPhone,
    stopPhone,
    /** The phone's approval while its page shows, for the developer harness. */
    currentApproval: (): BrowserApproval | null => approval,
    resume,
    /** Whether Add a Passkey may start: the step-up still holds, by the clock. */
    addPasskeyAllowed: (): boolean => deps.now() < stepUpUntil,
    dismissApproved,
    cloudSyncChecked,
    thatWasntMe,
    clearProblem,
    leave,
  }
}

export type WebSignIn = ReturnType<typeof createWebSignIn>

export type { ApprovalFailure }
