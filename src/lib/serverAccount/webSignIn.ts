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
import { STEP_UP_WINDOW_MS } from '@/lib/serverAccount/stepUp'
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
import { HttpError } from '@/lib/http/request'
import {
  AccountSessionError,
  type SessionEndReason,
} from '@/lib/serverAccount/session'
import { type WebAccount, WebSignInError } from '@/lib/serverAccount/webAccount'
import type {
  WebSignInMark,
  WebSignInMarkStore,
} from '@/lib/serverAccount/webSignInMark'

export type WebSignInMethod = 'passkey' | 'phone' | 'recovery'

export type WebSignInFailure =
  | 'cancelled'
  | 'notSupported'
  | 'noPasskey'
  | 'passkeyFailed'
  | 'wrongAccount'
  | 'otherAccount'
  | 'unknownAccount'
  | 'keyRetired'
  | 'turnstileFailed'
  | 'checkNeeded'
  | 'rateLimited'
  | 'expired'
  | 'offline'
  | 'unavailable'
  | 'updateRequired'
  | 'storage'
  | 'signUpPending'
  | 'keyHeld'
  | 'failed'

export type WebSignInProblem = {
  method: WebSignInMethod
  failure: WebSignInFailure
  retryAfterMs: number | null

  account?: string

  changedAt?: number | null
}

export type WebSignInState = {
  busy: WebSignInMethod | null
  problem: WebSignInProblem | null

  cantUnlock: { reason: PasskeyUnlockProblem; prf: boolean } | null

  approvedBy: string | null

  cloudSync: boolean

  recoveryNeedsCheck: boolean

  canAddPasskey: boolean

  wrapSaved: boolean | null

  ended: SessionEndReason | null
}

export type WebSignInEvent =
  | { type: 'started'; method: WebSignInMethod }
  | {
      type: 'succeeded'
      method: WebSignInMethod

      afterPasskey: boolean

      wrap: 'saved' | 'failed' | 'none' | 'pending'
    }
  | { type: 'failed'; method: WebSignInMethod; reason: WebSignInFailureReason }
  | { type: 'cantUnlock'; reason: PasskeyUnlockProblem; prf: boolean }
  | { type: 'thatWasntMe' }

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
    challenge: () => Promise<PasskeyChallenge>

    get: (
      options: PublicKeyCredentialRequestOptionsJSON
    ) => Promise<PasskeyAssertion>

    assert: (args: {
      challengeToken: string
      response: PasskeyResponseJSON
    }) => Promise<PasskeySignIn>

    saveWrap: (
      accountKey: Uint8Array,
      wrap: PasskeyWrap & { credentialId: string }
    ) => Promise<void>
  }

  recovery: (
    accountKey: Uint8Array,
    turnstileToken: string
  ) => Promise<WebTicket>

  createApproval: () => BrowserApproval

  accountKey: () => Promise<Uint8Array | null>
  mark: WebSignInMarkStore
  randomBytes: (length: number) => Uint8Array

  now: () => number

  schedule?: (run: () => void, ms: number) => () => void
  onEvent?: (event: WebSignInEvent) => void
}

const TICKET_MARGIN_MS = 5_000

export { STEP_UP_WINDOW_MS }

const STEP_UP_MARGIN_MS = 60_000

const scheduleTimeout = (run: () => void, ms: number) => {
  const timer = setTimeout(run, ms)
  return () => clearTimeout(timer)
}

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

function retiredAt(error: unknown): number | null {
  if (error instanceof AccountSessionError && error.changedAt !== null)
    return error.changedAt
  if (!(error instanceof HttpError)) return null
  const changedAt = (error.body as { changedAt?: unknown } | null)?.changedAt
  return typeof changedAt === 'number' ? changedAt : null
}

export function webSignInFailureFor(error: unknown): {
  failure: WebSignInFailure
  retryAfterMs: number | null

  reason: WebSignInFailureReason

  changedAt?: number | null
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
      return result(failure)
    case 'keyRetired':
      return { ...result(failure), changedAt: retiredAt(error) }
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

  let cancelTicketTimer: (() => void) | null = null

  let stepUpUntil = 0
  let cancelStepUpTimer: (() => void) | null = null

  let only: string | null = null

  const set = (next: Partial<WebSignInState>) => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  const emit = (event: WebSignInEvent) => {
    try {
      deps.onEvent?.(event)
    } catch {}
  }

  function begin(method: WebSignInMethod): boolean {
    if (state.busy) return false
    set({ busy: method, problem: null })
    emit({ type: 'started', method })
    return true
  }

  const problemOf = (
    method: WebSignInMethod,
    failure: WebSignInFailure,
    retryAfterMs: number | null
  ): WebSignInProblem =>
    failure === 'otherAccount' && only !== null
      ? { method, failure, retryAfterMs, account: only }
      : { method, failure, retryAfterMs }

  function failed(method: WebSignInMethod, error: unknown) {
    const { failure, retryAfterMs, reason, changedAt } =
      webSignInFailureFor(error)
    emit({ type: 'failed', method, reason })
    set({
      busy: null,
      problem:
        failure === 'cancelled'
          ? null
          : {
              ...problemOf(method, failure, retryAfterMs),
              ...(changedAt != null && { changedAt }),
            },
    })
  }

  function refuse(
    method: WebSignInMethod,
    failure: Exclude<WebSignInFailure, 'cancelled'>,
    reason: WebSignInFailureReason = failure
  ) {
    emit({ type: 'failed', method, reason })
    set({ busy: null, problem: problemOf(method, failure, null) })
  }

  const notThisAccount = (accountId: string) =>
    only !== null && accountId !== only

  function ticketGone() {
    cancelTicketTimer?.()
    cancelTicketTimer = null
    if (pending) pending.ticket = null
    set({ recoveryNeedsCheck: true })
  }

  function keepPending(next: Pending) {
    forgetPasskey()
    pending = next
    const left = next.ticketExpiresAt - TICKET_MARGIN_MS - deps.now()
    if (!next.ticket || left <= 0) return ticketGone()
    cancelTicketTimer = schedule(ticketGone, left)
    set({ recoveryNeedsCheck: false })
  }

  function forgetPasskey() {
    cancelTicketTimer?.()
    cancelTicketTimer = null
    pending?.prf?.fill(0)
    pending = null
    if (state.cantUnlock || !state.recoveryNeedsCheck)
      set({ cantUnlock: null, recoveryNeedsCheck: true })
  }

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

  const othersKey = (accountKey: Uint8Array) =>
    pending !== null &&
    deriveAccountSigningKey(accountKey).publicKey !== pending.accountPub

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
      outcome = 'failed'
    }
    forget()
    set({ wrapSaved: outcome === 'saved' })
    return outcome
  }

  async function open(
    method: WebSignInMethod,
    ticket: string,
    accountKey: Uint8Array,
    accountId: string,
    phone?: { deviceName: string; onStored: () => Promise<void> }
  ): Promise<boolean> {
    const afterPasskey = pending !== null && method !== 'passkey'
    const wrap = pendingWrap(accountKey, accountId)

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
        {
          expectAccountId: accountId,
          onStored: phone?.onStored,
          keepData: only !== null,
        }
      ))
    } catch (error) {
      deps.mark.write(null)
      throw error
    }
    forgetPasskey()
    if (reload) {
      emit({
        type: 'succeeded',
        method,
        afterPasskey,
        wrap: wrap ? 'pending' : 'none',
      })
      return false
    }
    const saved = await saveMarkedWrap(accountKey, accountId)
    emit({ type: 'succeeded', method, afterPasskey, wrap: saved })
    set({ busy: null, approvedBy: phone?.deviceName ?? null, cloudSync: true })
    if (phone) stepUpFrom(openedAt)
    return true
  }

  async function signInWithPasskey(): Promise<void> {
    if (!begin('passkey')) return

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

      if (signIn.credentialId !== assertion.response.id) {
        assertion.prf?.fill(0)
        return refuse('passkey', 'passkeyFailed', 'credential')
      }
      if (notThisAccount(signIn.accountId)) {
        assertion.prf?.fill(0)
        return refuse('passkey', 'otherAccount')
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

  function pendingTicket() {
    if (!pending?.ticket) return null
    if (deps.now() < pending.ticketExpiresAt - TICKET_MARGIN_MS)
      return { ticket: pending.ticket, accountId: pending.accountId }

    ticketGone()
    return null
  }

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
          if (webSignInFailureFor(error).failure !== 'expired') throw error
          ticketGone()
        }
      if (!turnstileToken) return refuse('recovery', 'checkNeeded')
      const { ticket, accountId } = await deps.recovery(
        accountKey,
        turnstileToken
      )
      if (notThisAccount(accountId)) return refuse('recovery', 'otherAccount')
      if (pending && accountId !== pending.accountId)
        return refuse('recovery', 'wrongAccount')
      await open('recovery', ticket, accountKey, accountId)
    } catch (error) {
      failed('recovery', error)
    }
  }

  async function received(current: BrowserApproval) {
    const step = current.state
    if (step.step !== 'received' || approval !== current) return
    const { accountKey, accountId, deviceName, ticket } = step.received
    set({ busy: 'phone', problem: null })
    if (notThisAccount(accountId)) {
      void current.cancel()
      return refuse('phone', 'otherAccount')
    }
    if (othersKey(accountKey) || (pending && pending.accountId !== accountId)) {
      void current.cancel()
      return refuse('phone', 'wrongAccount')
    }
    try {
      await open('phone', ticket, accountKey, accountId, {
        deviceName,

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

  function stopPhone() {
    stopApproval?.()
    stopApproval = null
    const current = approval
    approval = null

    if (current && current.state.step !== 'received') current.dispose()
  }

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

  function dismissApproved() {
    const { approvedBy: _, openedAt: __, ...rest } = deps.mark.read() ?? {}
    deps.mark.write(rest)
    stepUpFrom(undefined)
    set({ approvedBy: null })
  }

  function cloudSyncChecked() {
    const { cloudSync: _, ...rest } = deps.mark.read() ?? {}
    deps.mark.write(rest)
    set({ cloudSync: false })
  }

  async function thatWasntMe(): Promise<void> {
    emit({ type: 'thatWasntMe' })
    deps.mark.write(null)
    await deps.account.signOut()
  }

  const clearProblem = () => set({ problem: null })

  function onlyAccount(accountId: string | null) {
    if (only === accountId) return
    only = accountId
    if (state.problem) set({ problem: null })
  }

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

    currentApproval: (): BrowserApproval | null => approval,
    resume,

    addPasskeyAllowed: (): boolean => deps.now() < stepUpUntil,
    dismissApproved,
    cloudSyncChecked,
    thatWasntMe,
    clearProblem,
    onlyAccount,
    leave,
  }
}

export type WebSignIn = ReturnType<typeof createWebSignIn>

export type { ApprovalFailure }
