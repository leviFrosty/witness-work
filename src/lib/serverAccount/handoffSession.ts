import { HttpError } from '@/lib/http/request'
import {
  buildHandoffLink,
  createHandoffKeyPair,
  createHandoffOffer,
  deriveClaimToken,
  deriveHandoffKeys,
  deriveVerifier,
  type HandoffAccountKey,
  type HandoffHello,
  type HandoffKeys,
  type HandoffOffer,
  openAccountKey,
  openHello,
  sealAccountKey,
  sealHello,
} from '@/lib/serverAccount/handoff'
import {
  cancelHandoffAsClaim,
  cancelHandoffAsOffer,
  claimHandoff,
  finishHandoff,
  type HandoffStatus,
  handoffStatus,
  openHandoff,
  receiveHandoff,
  sendHandoffKey,
} from '@/lib/serverAccount/handoffClient'
import type { AccountAuthorize } from '@/lib/serverAccount/client'
import {
  AccountSessionError,
  attestationProblemFor,
} from '@/lib/serverAccount/session'

/**
 * One Set Up Another Device attempt on each phone (docs/accounts-protocol.md,
 * "Handoff"), as a small state machine the screens poll and the developer Tools
 * run end to end. The old phone's session **offers** the account; the new
 * phone's **claims** it. Every request and its answer go to an event log with
 * codes but no secrets.
 */

export type HandoffRole = 'offer' | 'claim'

/** Why a handoff stopped, as the screens explain it. */
export type HandoffFailure =
  /** No connection, or the request timed out. */
  | 'offline'
  /** Accounts are off on the server (`disabled`). */
  | 'unavailable'
  /** The channel expired or never existed (`not_found`). */
  | 'expired'
  /** Another phone already claimed this code (`conflict` on claim). */
  | 'used'
  /** An op in the wrong state (`conflict`). */
  | 'conflict'
  /** The other phone stopped, or five wrong tokens burned the channel. */
  | 'cancelled'
  /** The claim token was refused (`bad_signature`). */
  | 'badToken'
  /** A blob didn't open, or the account didn't match: keys were swapped. */
  | 'tampered'
  /** The server doesn't know this phone's account, or it isn't the opener's. */
  | 'noAccount'
  /** This phone couldn't prove it's WitnessWork, so it has no session. */
  | 'unverified'
  /** The same, but only for now: Apple's or Google's check was unavailable. */
  | 'verifyLater'
  /** Ww-api needs a newer app version (426). */
  | 'updateRequired'
  | 'rateLimited'
  /** Anything else the server said. */
  | 'server'

export type HandoffEvent = {
  at: number
  op: string
  /** `ok`, the server's code, or the client's own (`offline`, `tampered`). */
  outcome: string
  httpStatus?: number | null
  /** The channel's status, when the answer carried one. */
  status?: HandoffStatus
  ms?: number
}

/** What the developer Tools show; never a key, secret, token, or blob. */
export type HandoffDebugSnapshot = {
  role: HandoffRole
  step: string
  channelId: string | null
  status: HandoffStatus | null
  expiresAt: number | null
  offerPub: string | null
  claimPub: string | null
  code: string | null
  failure: HandoffFailure | null
  events: HandoffEvent[]
}

export function handoffFailureFor(error: unknown, op: string): HandoffFailure {
  if (error instanceof AccountSessionError && error.failure === 'attestation')
    return error.attestation === 'temporary' ? 'verifyLater' : 'unverified'
  if (!(error instanceof HttpError)) return 'server'
  if (error.status === 426 || error.serverCode === 'upgrade_required')
    return 'updateRequired'
  if (error.serverCode === 'attestation_failed') {
    const reason = (error.body as { reason?: unknown } | null)?.reason
    return attestationProblemFor(
      null,
      typeof reason === 'string' ? reason : null
    ) === 'temporary'
      ? 'verifyLater'
      : 'unverified'
  }
  if (
    error.kind === 'offline' ||
    error.kind === 'timeout' ||
    error.kind === 'cancelled'
  )
    return 'offline'
  switch (error.serverCode) {
    case 'disabled':
      return 'unavailable'
    case 'not_found':
      return 'expired'
    case 'conflict':
      return op === 'handoff/claim' ? 'used' : 'conflict'
    case 'bad_signature':
      return 'badToken'
    case 'unknown_account':
    case 'forbidden':
      return 'noAccount'
    case 'rate_limited':
      return 'rateLimited'
  }
  return error.kind === 'rateLimited' ? 'rateLimited' : 'server'
}

/**
 * Failed status checks in a row, from a busy or restarting server (5xx) or a
 * rate limit, before the attempt fails. Polls run every couple of seconds, so
 * one bad answer mustn't lose a code that's good for minutes.
 */
export const HANDOFF_POLL_FAILURE_LIMIT = 5

/**
 * Whether a failed status check ends the attempt. A lost connection never does
 * (the next tick tries again); a server error or rate limit does only after
 * `HANDOFF_POLL_FAILURE_LIMIT` in a row; anything else does at once.
 */
function createPollFailures() {
  let inARow = 0
  return {
    succeeded() {
      inARow = 0
    },
    endsAttempt(reason: HandoffFailure) {
      if (reason === 'offline') return false
      if (reason !== 'server' && reason !== 'rateLimited') return true
      inARow += 1
      return inARow >= HANDOFF_POLL_FAILURE_LIMIT
    },
  }
}

const outcomeOf = (error: unknown) =>
  error instanceof HttpError ? (error.serverCode ?? error.kind) : 'error'

type Listener = () => void

type SessionDeps = {
  baseUrl: string
  /** Request timestamps (`syncNow` in the app); also the expiry clock. */
  now: () => number
  randomBytes: (length: number) => Uint8Array
  fetchImpl?: typeof fetch
  /** Every request's outcome, as it happens. */
  onEvent?: (event: HandoffEvent) => void
}

/** Keeps the event log and tells subscribers about state changes. */
function createCore<State extends { step: string }>(
  role: HandoffRole,
  initial: State,
  deps: SessionDeps
) {
  let state = initial
  const listeners = new Set<Listener>()
  const events: HandoffEvent[] = []
  const core = {
    get state() {
      return state
    },
    set(next: State) {
      state = next
      for (const listener of listeners) listener()
    },
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    events,
    log(event: Omit<HandoffEvent, 'at'>) {
      const full = { at: Date.now(), ...event }
      events.push(full)
      if (events.length > 200) events.shift()
      deps.onEvent?.(full)
      for (const listener of listeners) listener()
    },
    /** Runs one request, logging its outcome. */
    async call<T>(
      op: string,
      run: () => Promise<T>,
      statusOf?: (value: T) => HandoffStatus | undefined
    ): Promise<T> {
      const started = Date.now()
      try {
        const value = await run()
        core.log({
          op,
          outcome: 'ok',
          status: statusOf?.(value),
          ms: Date.now() - started,
        })
        return value
      } catch (error) {
        core.log({
          op,
          outcome: outcomeOf(error),
          httpStatus: error instanceof HttpError ? error.status : null,
          ms: Date.now() - started,
        })
        throw error
      }
    },
    role,
  }
  return core
}

// --- The old phone ----------------------------------------------------------

export type OfferState =
  | { step: 'idle' }
  | { step: 'opening' }
  /** The QR is up; nobody has claimed it yet. */
  | { step: 'waiting'; link: string; expiresAt: number }
  /**
   * A phone claimed it: the User allows it or not. `sendFailed` after an Allow
   * that didn't get through, so the User can tap it again.
   */
  | {
      step: 'confirm'
      hello: HandoffHello
      code: string
      expiresAt: number
      sendFailed?: boolean
    }
  | { step: 'sending'; hello: HandoffHello; code: string; expiresAt: number }
  /** Sent; waiting for the new phone to pick it up. */
  | { step: 'sent'; hello: HandoffHello; code: string; expiresAt: number }
  | { step: 'done'; hello: HandoffHello }
  /** The User said Don't Allow. */
  | { step: 'declined'; hello: HandoffHello | null }
  /** Left, or made a new code. */
  | { step: 'cancelled' }
  | { step: 'failed'; reason: HandoffFailure }

export type OfferAccount = {
  accountKey: Uint8Array
  accountId: string
  /** The account's session: the old phone's ops are Bearer. */
  authorize: AccountAuthorize
}

export type OfferSession = ReturnType<typeof createOfferSession>

/**
 * The old phone's side: open a channel and show its link, poll until a phone
 * claims it, open that phone's hello and show the code, then send the sealed
 * account key once the User allows it and wait for `done`.
 */
export function createOfferSession(account: OfferAccount, deps: SessionDeps) {
  const core = createCore<OfferState>('offer', { step: 'idle' }, deps)
  const created = createHandoffOffer(deps.randomBytes)
  const offer: HandoffOffer = created.offer
  const verifier = deriveVerifier(
    deriveClaimToken(offer.secret, offer.channelId)
  )
  let keys: HandoffKeys | null = null
  let claimPub: string | null = null
  let status: HandoffStatus | null = null
  let expiresAt: number | null = null
  let failure: HandoffFailure | null = null
  let polling = false
  const pollFailures = createPollFailures()

  const options = () => ({
    baseUrl: deps.baseUrl,
    authorize: account.authorize,
    fetchImpl: deps.fetchImpl,
  })

  const terminal = () =>
    ['done', 'declined', 'cancelled', 'failed'].includes(core.state.step)

  const fail = (reason: HandoffFailure) => {
    failure = reason
    core.set({ step: 'failed', reason })
  }

  /** Ends the channel on the server; best effort. */
  const cancelOnServer = () =>
    core
      .call('handoff/cancel', () =>
        cancelHandoffAsOffer(offer.channelId, options())
      )
      .then(() => {
        if (status !== 'done') status = 'cancelled'
      })
      .catch(() => undefined)

  async function open(): Promise<void> {
    if (core.state.step !== 'idle') return
    core.set({ step: 'opening' })
    try {
      const opened = await core.call('handoff/open', () =>
        openHandoff({ channelId: offer.channelId, verifier }, options())
      )
      status = 'open'
      expiresAt = opened.expiresAt
      // Cancelled while the channel opened: close it again.
      if (terminal()) return void (await cancelOnServer())
      core.set({
        step: 'waiting',
        link: buildHandoffLink(offer),
        expiresAt: opened.expiresAt,
      })
    } catch (error) {
      if (!terminal()) fail(handoffFailureFor(error, 'handoff/open'))
    }
  }

  /** One status check. Overlapping calls are skipped. */
  async function poll(): Promise<void> {
    const step = core.state.step
    if (polling || (step !== 'waiting' && step !== 'sent')) return
    if (expiresAt !== null && deps.now() >= expiresAt) return fail('expired')
    polling = true
    try {
      const view = await core.call(
        'handoff/status',
        () => handoffStatus(offer.channelId, options()),
        (value) => value.status
      )
      pollFailures.succeeded()
      if (terminal()) return
      status = view.status
      expiresAt = view.expiresAt
      const current = core.state
      if (view.status === 'cancelled') return fail('cancelled')
      if (current.step === 'waiting' && view.status === 'claimed') {
        if (!view.claimPub || !view.hello) return
        claimPub = view.claimPub
        keys = deriveHandoffKeys({
          privateKey: created.keyPair.privateKey,
          peerPublicKey: view.claimPub,
          secret: offer.secret,
          channelId: offer.channelId,
          offerPub: offer.offerPub,
          claimPub: view.claimPub,
        })
        let hello: HandoffHello
        try {
          hello = openHello(keys, offer.channelId, view.hello)
        } catch {
          // Not sealed with this QR's keys: something swapped claimPub.
          core.log({ op: 'open hello', outcome: 'tampered' })
          fail('tampered')
          void cancelOnServer()
          return
        }
        core.set({
          step: 'confirm',
          hello,
          code: keys.code,
          expiresAt: view.expiresAt,
        })
      } else if (current.step === 'sent' && view.status === 'done') {
        core.set({ step: 'done', hello: current.hello })
      }
    } catch (error) {
      if (!terminal()) {
        const reason = handoffFailureFor(error, 'handoff/status')
        // A dropped poll is retried on the next tick.
        if (pollFailures.endsAttempt(reason)) fail(reason)
      }
    } finally {
      polling = false
    }
  }

  /** Allow: seals the account key to the new phone and sends it. */
  async function approve(): Promise<void> {
    const current = core.state
    if (current.step !== 'confirm' || !keys) return
    const { sendFailed: _, ...asked } = current
    core.set({ ...asked, step: 'sending' })
    try {
      const key = sealAccountKey(
        keys,
        offer.channelId,
        { accountKey: account.accountKey, accountId: account.accountId },
        deps.randomBytes
      )
      await core.call('handoff/send', () =>
        sendHandoffKey({ channelId: offer.channelId, key }, options())
      )
      if (terminal()) return
      status = 'sent'
      core.set({ ...asked, step: 'sent' })
    } catch (error) {
      if (terminal()) return
      const reason = handoffFailureFor(error, 'handoff/send')
      if (reason !== 'offline' && reason !== 'conflict') return fail(reason)
      await settleSend(asked, reason)
    }
  }

  /**
   * After a send that failed: a lost answer may have delivered the key (and a
   * repeat of it answers `conflict`), so the channel's status decides. Still
   * `claimed` after a lost connection, the User can tap Allow again.
   */
  async function settleSend(
    asked: Extract<OfferState, { step: 'confirm' }>,
    reason: 'offline' | 'conflict'
  ): Promise<void> {
    let view: HandoffStatus
    try {
      view = (
        await core.call(
          'handoff/status',
          () => handoffStatus(offer.channelId, options()),
          (value) => value.status
        )
      ).status
    } catch {
      if (!terminal()) core.set({ ...asked, sendFailed: true })
      return
    }
    if (terminal()) return
    status = view
    if (view === 'sent') core.set({ ...asked, step: 'sent' })
    else if (view === 'done') core.set({ step: 'done', hello: asked.hello })
    else if (view === 'cancelled') fail('cancelled')
    else if (view === 'claimed' && reason === 'offline')
      core.set({ ...asked, sendFailed: true })
    else fail(reason)
  }

  /** Don't Allow: ends the channel. */
  async function decline(): Promise<void> {
    if (terminal()) return
    const current = core.state
    core.set({
      step: 'declined',
      hello: 'hello' in current ? current.hello : null,
    })
    await cancelOnServer()
  }

  /** The screen closed or a new code replaced this one. */
  async function cancel(): Promise<void> {
    if (terminal()) return
    const step = core.state.step
    core.set({ step: 'cancelled' })
    // While opening, `open` cancels once its answer is in.
    if (step !== 'idle' && step !== 'opening') await cancelOnServer()
  }

  /** For the Tools: drops the channel on the server without changing state. */
  const cancelOnServerOnly = () => cancelOnServer()

  function debug(): HandoffDebugSnapshot {
    const current = core.state
    return {
      role: 'offer',
      step: current.step,
      channelId: offer.channelId,
      status,
      expiresAt,
      offerPub: offer.offerPub,
      claimPub,
      code: keys?.code ?? null,
      failure,
      events: [...core.events],
    }
  }

  return {
    role: 'offer' as const,
    get state() {
      return core.state
    },
    subscribe: core.subscribe,
    channelId: offer.channelId,
    open,
    poll,
    approve,
    decline,
    cancel,
    cancelOnServerOnly,
    /** Ends the attempt locally as expired, without a request (Tools). */
    expire: () => {
      if (!terminal()) fail('expired')
    },
    debug,
  }
}

// --- The new phone ----------------------------------------------------------

export type ClaimState =
  | { step: 'idle' }
  | { step: 'claiming' }
  /** Claimed; waiting for the old phone to allow it. */
  | { step: 'waiting'; code: string; expiresAt: number }
  /** The key arrived; the app checks and stores it, then calls `finish`. */
  | { step: 'received'; code: string; received: HandoffAccountKey }
  | { step: 'finishing'; code: string }
  | { step: 'done' }
  /** This phone stopped (the User declined replacing, or left). */
  | { step: 'cancelled' }
  | { step: 'failed'; reason: HandoffFailure }

export type ClaimSession = ReturnType<typeof createClaimSession>

/**
 * The new phone's side: claim the channel with a temporary key and a sealed
 * hello, show the code, poll until the old phone sends the key, and open it.
 * The caller checks and stores the key, then calls `finish` (`done`), or
 * `cancel`.
 */
export function createClaimSession(
  offer: HandoffOffer,
  hello: HandoffHello,
  deps: SessionDeps
) {
  const core = createCore<ClaimState>('claim', { step: 'idle' }, deps)
  const keyPair = createHandoffKeyPair(deps.randomBytes)
  const claimToken = deriveClaimToken(offer.secret, offer.channelId)
  const keys = deriveHandoffKeys({
    privateKey: keyPair.privateKey,
    peerPublicKey: offer.offerPub,
    secret: offer.secret,
    channelId: offer.channelId,
    offerPub: offer.offerPub,
    claimPub: keyPair.publicKey,
  })
  // Sealed once, so a repeated claim (a lost response) has the same body.
  const sealedHello = sealHello(keys, offer.channelId, hello, deps.randomBytes)
  let status: HandoffStatus | null = null
  let expiresAt: number | null = null
  let failure: HandoffFailure | null = null
  let polling = false
  const pollFailures = createPollFailures()

  const options = () => ({ baseUrl: deps.baseUrl, fetchImpl: deps.fetchImpl })
  const token = { channelId: offer.channelId, claimToken }

  const terminal = () =>
    ['done', 'cancelled', 'failed'].includes(core.state.step)

  const fail = (reason: HandoffFailure) => {
    failure = reason
    core.set({ step: 'failed', reason })
  }

  const cancelOnServer = () =>
    core
      .call('handoff/cancel', () => cancelHandoffAsClaim(token, options()))
      .then(() => {
        if (status !== 'done') status = 'cancelled'
      })
      .catch(() => undefined)

  async function claim(): Promise<void> {
    if (core.state.step !== 'idle') return
    core.set({ step: 'claiming' })
    const send = () =>
      core.call('handoff/claim', () =>
        claimHandoff(
          { ...token, claimPub: keyPair.publicKey, hello: sealedHello },
          options()
        )
      )
    try {
      let claimed: { expiresAt: number }
      try {
        claimed = await send()
      } catch (error) {
        // The same claim again is `ok` if only the answer got lost.
        if (handoffFailureFor(error, 'handoff/claim') !== 'offline') throw error
        claimed = await send()
      }
      if (terminal()) return
      status = 'claimed'
      expiresAt = claimed.expiresAt
      core.set({
        step: 'waiting',
        code: keys.code,
        expiresAt: claimed.expiresAt,
      })
    } catch (error) {
      if (!terminal()) fail(handoffFailureFor(error, 'handoff/claim'))
    }
  }

  /** One receive check. Overlapping calls are skipped. */
  async function poll(): Promise<void> {
    if (polling || core.state.step !== 'waiting') return
    if (expiresAt !== null && deps.now() >= expiresAt) return fail('expired')
    polling = true
    try {
      const view = await core.call(
        'handoff/receive',
        () => receiveHandoff(token, options()),
        (value) => value.status
      )
      pollFailures.succeeded()
      if (terminal() || core.state.step !== 'waiting') return
      status = view.status
      if (view.status === 'cancelled') return fail('cancelled')
      if (view.status === 'done') return fail('conflict')
      if (view.status !== 'sent' || !view.key) return
      let received: HandoffAccountKey
      try {
        received = openAccountKey(keys, offer.channelId, view.key)
      } catch {
        core.log({ op: 'open key', outcome: 'tampered' })
        fail('tampered')
        void cancelOnServer()
        return
      }
      core.set({ step: 'received', code: keys.code, received })
    } catch (error) {
      if (!terminal()) {
        const reason = handoffFailureFor(error, 'handoff/receive')
        if (pollFailures.endsAttempt(reason)) fail(reason)
      }
    } finally {
      polling = false
    }
  }

  /** The key is stored: tells the server, which drops the blobs. */
  async function finish(): Promise<void> {
    const current = core.state
    if (current.step !== 'received') return
    core.set({ step: 'finishing', code: current.code })
    try {
      try {
        await core.call('handoff/done', () => finishHandoff(token, options()))
      } catch (error) {
        if (handoffFailureFor(error, 'handoff/done') !== 'offline') throw error
        await core.call('handoff/done', () => finishHandoff(token, options()))
      }
      status = 'done'
      core.set({ step: 'done' })
    } catch (error) {
      // The key is already this phone's; only the server's tidy-up failed,
      // and the channel expires on its own.
      core.log({
        op: 'done',
        outcome: handoffFailureFor(error, 'handoff/done'),
      })
      core.set({ step: 'done' })
    }
  }

  async function cancel(): Promise<void> {
    const step = core.state.step
    if (terminal()) return
    core.set({ step: 'cancelled' })
    if (step !== 'idle') await cancelOnServer()
  }

  function debug(): HandoffDebugSnapshot {
    const current = core.state
    return {
      role: 'claim',
      step: current.step,
      channelId: offer.channelId,
      status,
      expiresAt,
      offerPub: offer.offerPub,
      claimPub: keyPair.publicKey,
      code: keys.code,
      failure,
      events: [...core.events],
    }
  }

  return {
    role: 'claim' as const,
    get state() {
      return core.state
    },
    subscribe: core.subscribe,
    channelId: offer.channelId,
    code: keys.code,
    claim,
    poll,
    finish,
    cancel,
    /** Records a failure the app found after `received` (e.g. a mismatch). */
    fail: (reason: HandoffFailure) => {
      if (terminal()) return
      fail(reason)
      void cancelOnServer()
    },
    expire: () => {
      if (!terminal()) fail('expired')
    },
    debug,
  }
}
