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

export type HandoffRole = 'offer' | 'claim'

export type HandoffFailure =
  | 'offline'
  | 'unavailable'
  | 'expired'
  | 'used'
  | 'conflict'
  | 'cancelled'
  | 'badToken'
  | 'tampered'
  | 'noAccount'
  | 'unverified'
  | 'verifyLater'
  | 'updateRequired'
  | 'rateLimited'
  | 'server'

export type HandoffEvent = {
  at: number
  op: string

  outcome: string
  httpStatus?: number | null

  status?: HandoffStatus
  ms?: number
}

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

export const HANDOFF_POLL_FAILURE_LIMIT = 5

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

  now: () => number
  randomBytes: (length: number) => Uint8Array
  fetchImpl?: typeof fetch

  onEvent?: (event: HandoffEvent) => void
}

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

export type OfferState =
  | { step: 'idle' }
  | { step: 'opening' }
  | { step: 'waiting'; link: string; expiresAt: number }
  | {
      step: 'confirm'
      hello: HandoffHello
      code: string
      expiresAt: number
      sendFailed?: boolean
    }
  | { step: 'sending'; hello: HandoffHello; code: string; expiresAt: number }
  | { step: 'sent'; hello: HandoffHello; code: string; expiresAt: number }
  | { step: 'done'; hello: HandoffHello }
  | { step: 'declined'; hello: HandoffHello | null }
  | { step: 'cancelled' }
  | { step: 'failed'; reason: HandoffFailure }

export type OfferAccount = {
  accountKey: Uint8Array
  accountId: string

  authorize: AccountAuthorize
}

export type OfferSession = ReturnType<typeof createOfferSession>

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

        if (pollFailures.endsAttempt(reason)) fail(reason)
      }
    } finally {
      polling = false
    }
  }

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

  async function decline(): Promise<void> {
    if (terminal()) return
    const current = core.state
    core.set({
      step: 'declined',
      hello: 'hello' in current ? current.hello : null,
    })
    await cancelOnServer()
  }

  async function cancel(): Promise<void> {
    if (terminal()) return
    const step = core.state.step
    core.set({ step: 'cancelled' })

    if (step !== 'idle' && step !== 'opening') await cancelOnServer()
  }

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

    expire: () => {
      if (!terminal()) fail('expired')
    },
    debug,
  }
}

export type ClaimState =
  | { step: 'idle' }
  | { step: 'claiming' }
  | { step: 'waiting'; code: string; expiresAt: number }
  | { step: 'received'; code: string; received: HandoffAccountKey }
  | { step: 'finishing'; code: string }
  | { step: 'done' }
  | { step: 'cancelled' }
  | { step: 'failed'; reason: HandoffFailure }

export type ClaimSession = ReturnType<typeof createClaimSession>

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
