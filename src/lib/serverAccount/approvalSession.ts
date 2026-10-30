import {
  type ApprovalAccountKey,
  type ApprovalHello,
  type ApprovalKeys,
  type ApprovalOffer,
  buildApprovalLink,
  createApprovalOffer,
  createBrowserToken,
  deriveApprovalClaimToken,
  deriveApprovalHelloKey,
  deriveApprovalKeys,
  openApprovalHello,
  openApprovalKey,
  type ParsedApprovalLink,
  parseApprovalLink,
  sealApprovalHello,
  sealApprovalKey,
} from '@/lib/serverAccount/approval'
import {
  type ApprovalLocation,
  type ApprovalStatus,
  approvalStatusAsBrowser,
  approvalStatusAsPhone,
  type BrowserToken,
  cancelApprovalAsBrowser,
  cancelApprovalAsPhone,
  claimApproval,
  finishApproval,
  openApproval,
  receiveApproval,
  sendApprovalKey,
} from '@/lib/serverAccount/approvalClient'
import {
  type ChannelEvent,
  type ChannelFailure,
  channelFailureFor,
  type ChannelSessionDeps,
  createCore,
  createPollFailures,
} from '@/lib/serverAccount/channelSession'
import type { AccountAuthorize } from '@/lib/serverAccount/client'
import {
  createHandoffKeyPair,
  deriveVerifier,
} from '@/lib/serverAccount/handoff'

/**
 * Approving a browser from a phone (docs/passkeys-protocol.md), as two small
 * state machines the screens drive. The **browser** shows a code that rotates
 * every minute, polls until a phone claims one, shows the six-digit code, and
 * hands the account key and its ticket to its caller. The **phone** claims a
 * scanned code, shows who's asking, and sends the key once the User approves.
 * Every request and its answer go to an event log with codes but no secrets.
 *
 * The browser's machine runs its own timers (rotation and polling) from `start`
 * until the key arrives or it ends; the phone's is driven by its screen, which
 * calls `poll` while it asks.
 */

export type ApprovalRole = 'browser' | 'phone'

/** Why an approval stopped, as the screens explain it. */
export type ApprovalFailure = ChannelFailure

export type ApprovalEvent = ChannelEvent<ApprovalStatus>

export type ApprovalSessionDeps = ChannelSessionDeps<ApprovalStatus>

/**
 * Reads a failed approval request; `claim` for the phone's claim, where
 * `conflict` means another phone scanned the code first.
 */
export const approvalFailureFor = (
  error: unknown,
  op: { claim?: boolean } = {}
): ApprovalFailure => channelFailureFor(error, op)

/** What the developer Tools show; never a key, secret, token, or blob. */
export type BrowserApprovalDebugSnapshot = {
  role: 'browser'
  step: BrowserApprovalState['step']
  /** Unclaimed channels still polled. */
  channels: string[]
  claimedChannelId: string | null
  codes: number
  code: string | null
  failure: ApprovalFailure | null
  events: ApprovalEvent[]
}

export type PhoneApprovalDebugSnapshot = {
  role: 'phone'
  step: PhoneApprovalState['step']
  channelId: string | null
  status: ApprovalStatus | null
  browserPub: string | null
  phonePub: string
  code: string | null
  failure: ApprovalFailure | null
  events: ApprovalEvent[]
}

/** A new code this often while the page shows one. */
export const APPROVAL_ROTATE_MS = 60_000
/** Codes in a row before the browser offers Show a New Code. */
export const APPROVAL_MAX_CODES = 10
/** How often the browser reads `status`, then `receive`. */
export const APPROVAL_POLL_MS = 1_500

// --- The browser ------------------------------------------------------------

/** What the browser's caller gets once the key arrives. */
export type ApprovalReceived = ApprovalAccountKey & {
  /** Opens the browser's web session (`POST /sessions`), within 2 minutes. */
  ticket: string
  ticketExpiresAt: number
}

export type BrowserApprovalState =
  | { step: 'idle' }
  | { step: 'opening' }
  /** The QR is up. `codes` counts the codes shown in a row. */
  | { step: 'showing'; link: string; expiresAt: number; codes: number }
  /** Ten codes went unclaimed: offer Show a New Code (`restart`). */
  | { step: 'expired' }
  /** A phone claimed one: show the same code it shows. */
  | { step: 'claimed'; code: string; expiresAt: number }
  /**
   * The key arrived. The caller opens its session with the ticket, checks the
   * account, stores the key, then calls `finish` (or `fail`).
   */
  | { step: 'received'; code: string; received: ApprovalReceived }
  | { step: 'finishing'; deviceName: string }
  /** "Approved by `deviceName`". */
  | { step: 'done'; deviceName: string }
  | { step: 'cancelled' }
  | { step: 'failed'; reason: ApprovalFailure }

export type BrowserApprovalDeps = ApprovalSessionDeps & {
  /** This page's origin: the QR's host. */
  origin: string
  /** "Chrome", "macOS", and this web build's version. */
  hello: ApprovalHello
}

type Channel = {
  offer: ApprovalOffer
  privateKey: Uint8Array
  token: BrowserToken
  expiresAt: number
}

export type BrowserApproval = ReturnType<typeof createBrowserApproval>

/**
 * The browser's side. `start` opens the first channel and runs its own timers
 * until the key arrives or `dispose` (or `cancel`) stops them.
 */
export function createBrowserApproval(deps: BrowserApprovalDeps) {
  const core = createCore<BrowserApprovalState, ApprovalStatus, ApprovalRole>(
    'browser',
    { step: 'idle' },
    deps
  )
  /** Unclaimed channels still polled, newest last. */
  let channels: Channel[] = []
  let current: Channel | null = null
  let claimed: { channel: Channel; keys: ApprovalKeys } | null = null
  let codes = 0
  let rotateTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let polling = false
  let opening = false
  let failure: ApprovalFailure | null = null
  const pollFailures = createPollFailures()

  const options = () => ({ baseUrl: deps.baseUrl, fetchImpl: deps.fetchImpl })

  const terminal = () =>
    ['done', 'cancelled', 'failed'].includes(core.state.step)

  function stopRotating() {
    if (rotateTimer) clearTimeout(rotateTimer)
    rotateTimer = null
  }

  function stopTimers() {
    stopRotating()
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  }

  const cancelOnServer = (channel: Channel) =>
    core
      .call('approval/cancel', () =>
        cancelApprovalAsBrowser(channel.token, options())
      )
      .catch(() => undefined)

  /** Drops every channel but `keep`, ending them on the server. */
  function cancelChannels(keep: Channel | null = null) {
    const others = channels.filter((channel) => channel !== keep)
    channels = keep ? [keep] : []
    for (const channel of others) void cancelOnServer(channel)
  }

  /** Stops the timers and ends every channel, the claimed one too. */
  function endAll() {
    stopTimers()
    const ending = [...channels]
    if (claimed && !ending.includes(claimed.channel))
      ending.push(claimed.channel)
    channels = []
    current = null
    return Promise.all(ending.map(cancelOnServer))
  }

  function fail(reason: ApprovalFailure) {
    failure = reason
    void endAll()
    core.set({ step: 'failed', reason })
  }

  /** Opens one more channel and shows it. */
  async function openChannel(): Promise<void> {
    if (opening || terminal() || claimed) return
    opening = true
    const { offer, keyPair } = createApprovalOffer(deps.randomBytes)
    const { browserToken, browserVerifier } = createBrowserToken(
      deps.randomBytes
    )
    const hello = sealApprovalHello(
      deriveApprovalHelloKey(offer.secret, offer.channelId),
      offer.channelId,
      deps.hello,
      deps.randomBytes
    )
    try {
      const opened = await core.call('approval/open', () =>
        openApproval(
          {
            channelId: offer.channelId,
            verifier: deriveVerifier(
              deriveApprovalClaimToken(offer.secret, offer.channelId)
            ),
            browserVerifier,
            hello,
          },
          options()
        )
      )
      const channel: Channel = {
        offer,
        privateKey: keyPair.privateKey,
        token: { channelId: offer.channelId, browserToken },
        expiresAt: opened.expiresAt,
      }
      // Stopped, or another channel claimed, while this one opened.
      if (terminal() || claimed || core.state.step === 'expired')
        return void (await cancelOnServer(channel))
      channels.push(channel)
      current = channel
      codes += 1
      core.set({
        step: 'showing',
        link: buildApprovalLink(offer, deps.origin),
        expiresAt: opened.expiresAt,
        codes,
      })
      scheduleRotation()
    } catch (error) {
      // A claim landed while this one opened: it no longer matters.
      if (terminal() || claimed) return
      const reason = approvalFailureFor(error)
      // Nothing to show yet: the attempt ends. A rotation that fails tries
      // again on the next tick while the code on screen still lives.
      if (!current || pollFailures.endsAttempt(reason)) fail(reason)
      else scheduleRotation(APPROVAL_POLL_MS)
    } finally {
      opening = false
    }
  }

  function scheduleRotation(ms = APPROVAL_ROTATE_MS) {
    stopRotating()
    rotateTimer = setTimeout(() => {
      rotateTimer = null
      void rotate()
    }, ms)
  }

  async function rotate(): Promise<void> {
    if (terminal() || claimed || core.state.step === 'expired') return
    if (codes >= APPROVAL_MAX_CODES) {
      // The last codes keep being polled until they expire, so a phone that
      // scanned one just now still gets through.
      current = null
      core.set({ step: 'expired' })
      return
    }
    await openChannel()
  }

  /** A phone claimed `channel`: stop rotating and end every other channel. */
  function claim(channel: Channel, phonePub: string, expiresAt: number) {
    let keys: ApprovalKeys
    try {
      keys = deriveApprovalKeys({
        privateKey: channel.privateKey,
        peerPublicKey: phonePub,
        secret: channel.offer.secret,
        channelId: channel.offer.channelId,
        browserPub: channel.offer.browserPub,
        phonePub,
      })
    } catch {
      // A low-order key: no phone made it, so something swapped it.
      core.log({ op: 'claim', outcome: 'tampered' })
      return fail('tampered')
    }
    stopRotating()
    claimed = { channel, keys }
    cancelChannels(channel)
    core.set({ step: 'claimed', code: keys.code, expiresAt })
  }

  /** One status check of every unclaimed channel still alive. */
  async function pollChannels(): Promise<void> {
    const now = deps.now()
    channels = channels.filter((channel) => channel.expiresAt > now)
    if (current && current.expiresAt <= now) current = null
    if (core.state.step === 'expired' && channels.length === 0) return
    for (const channel of [...channels].reverse()) {
      if (terminal() || claimed) return
      let view
      try {
        view = await core.call(
          'approval/status',
          () => approvalStatusAsBrowser(channel.token, options()),
          (value) => value.status
        )
        pollFailures.succeeded()
      } catch (error) {
        if (terminal() || claimed) return
        const reason = approvalFailureFor(error)
        if (reason === 'expired' || reason === 'cancelled') {
          drop(channel)
          continue
        }
        if (pollFailures.endsAttempt(reason)) return fail(reason)
        continue
      }
      if (terminal() || claimed) return
      // Claimed, or claimed and sent already between two polls: `receive`
      // picks the key up next.
      if (
        (view.status === 'claimed' || view.status === 'sent') &&
        view.phonePub
      )
        return claim(channel, view.phonePub, view.expiresAt)
      // Burned by wrong tokens, or ended elsewhere: show a fresh one.
      if (view.status !== 'open' && view.status !== 'claimed') drop(channel)
    }
  }

  function drop(channel: Channel) {
    channels = channels.filter((other) => other !== channel)
    if (channel === current) {
      current = null
      void rotate()
    }
  }

  /** One `receive` of the claimed channel. */
  async function pollReceive(): Promise<void> {
    if (!claimed || core.state.step !== 'claimed') return
    const { channel, keys } = claimed
    if (deps.now() >= core.state.expiresAt) return fail('expired')
    let view
    try {
      view = await core.call(
        'approval/receive',
        () => receiveApproval(channel.token, options()),
        (value) => value.status
      )
      pollFailures.succeeded()
    } catch (error) {
      if (terminal()) return
      const reason = approvalFailureFor(error)
      if (pollFailures.endsAttempt(reason)) fail(reason)
      return
    }
    if (core.state.step !== 'claimed') return
    if (view.status === 'cancelled') return fail('cancelled')
    if (view.status === 'done') return fail('conflict')
    if (
      view.status !== 'sent' ||
      !view.key ||
      !view.ticket ||
      view.ticketExpiresAt === undefined
    )
      return
    let key: ApprovalAccountKey
    try {
      key = openApprovalKey(keys.keyKey, channel.offer.channelId, view.key)
    } catch {
      core.log({ op: 'open key', outcome: 'tampered' })
      return fail('tampered')
    }
    stopTimers()
    core.set({
      step: 'received',
      code: keys.code,
      received: {
        ...key,
        ticket: view.ticket,
        ticketExpiresAt: view.ticketExpiresAt,
      },
    })
  }

  async function tick(): Promise<void> {
    if (polling || terminal()) return
    polling = true
    try {
      if (claimed) await pollReceive()
      else await pollChannels()
    } finally {
      polling = false
    }
  }

  /** Opens the first code and starts the timers. */
  async function start(): Promise<void> {
    if (core.state.step !== 'idle') return
    core.set({ step: 'opening' })
    pollTimer = setInterval(() => void tick(), APPROVAL_POLL_MS)
    await openChannel()
  }

  /** Show a New Code, after ten went unclaimed. */
  async function restart(): Promise<void> {
    if (core.state.step !== 'expired') return
    cancelChannels()
    codes = 0
    core.set({ step: 'opening' })
    await openChannel()
  }

  /** The session is open and the key stored: the server drops the blob. */
  async function finish(): Promise<void> {
    const state = core.state
    if (state.step !== 'received' || !claimed) return
    const { deviceName } = state.received
    core.set({ step: 'finishing', deviceName })
    const token = claimed.channel.token
    const done = () =>
      core.call('approval/done', () => finishApproval(token, options()))
    try {
      try {
        await done()
      } catch (error) {
        if (approvalFailureFor(error) !== 'offline') throw error
        await done()
      }
    } catch (error) {
      // The key is already this browser's; the channel expires on its own.
      core.log({ op: 'done', outcome: approvalFailureFor(error) })
    }
    // Disposed or cancelled meanwhile.
    if (core.state.step !== 'finishing') return
    core.set({ step: 'done', deviceName })
  }

  /** The page left, or the User started over: ends every channel. */
  async function cancel(): Promise<void> {
    if (terminal()) return
    const ended = endAll()
    core.set({ step: 'cancelled' })
    await ended
  }

  return {
    get state() {
      return core.state
    },
    subscribe: core.subscribe,
    start,
    restart,
    finish,
    cancel,
    /** Stops the timers and ends the channels; for an unmounting page. */
    dispose: () => void cancel(),
    /** The caller found a problem after `received` (another account). */
    fail: (reason: ApprovalFailure) => {
      if (!terminal()) fail(reason)
    },
    debug: (): BrowserApprovalDebugSnapshot => ({
      role: 'browser',
      step: core.state.step,
      channels: channels.map((channel) => channel.offer.channelId),
      claimedChannelId: claimed?.channel.offer.channelId ?? null,
      codes,
      code: claimed?.keys.code ?? null,
      failure,
      events: [...core.events],
    }),
  }
}

// --- The phone --------------------------------------------------------------

export type PhoneApprovalState =
  /** The scanned code isn't one this app accepts. */
  | {
      step: 'invalid'
      problem: Exclude<ParsedApprovalLink, { ok: true }>['problem']
    }
  | { step: 'idle' }
  | { step: 'claiming' }
  /**
   * Show the browser, where it is, the code, and a warning when `far`; the User
   * says Yes or No. `sendFailed` after a Yes that didn't get through.
   */
  | {
      step: 'confirm'
      hello: ApprovalHello
      location?: ApprovalLocation
      far: boolean
      code: string
      expiresAt: number
      sendFailed?: boolean
    }
  | {
      step: 'sending'
      hello: ApprovalHello
      location?: ApprovalLocation
      far: boolean
      code: string
      expiresAt: number
    }
  | { step: 'done'; hello: ApprovalHello }
  /** The User said No. */
  | { step: 'declined'; hello: ApprovalHello | null }
  | { step: 'cancelled' }
  | { step: 'failed'; reason: ApprovalFailure }

export type PhoneApprovalAccount = {
  accountKey: Uint8Array
  accountId: string
  /** This phone's name, shown on the browser as "Approved by …". */
  deviceName: string
  /** The phone's attested session: its ops are Bearer. */
  authorize: AccountAuthorize
}

export type PhoneApprovalDeps = ApprovalSessionDeps & {
  /** Web app origins this build accepts codes from (`appApprovalOrigins`). */
  origins: readonly string[]
}

export type PhoneApproval = ReturnType<typeof createPhoneApproval>

/**
 * The phone's side, for a code scanned inside the app: `claim`, then `approve`
 * once the caller has checked the device owner, or `decline`.
 */
export function createPhoneApproval(
  scanned: string,
  account: PhoneApprovalAccount,
  deps: PhoneApprovalDeps
) {
  const parsed = parseApprovalLink(scanned, deps.origins)
  const keyPair = createHandoffKeyPair(deps.randomBytes)
  // Derived before anything is claimed: a crafted low-order `browserPub` has
  // no shared secret, and the code is refused before the server holds it.
  let keys: ApprovalKeys | null = null
  if (parsed.ok)
    try {
      keys = deriveApprovalKeys({
        privateKey: keyPair.privateKey,
        peerPublicKey: parsed.offer.browserPub,
        secret: parsed.offer.secret,
        channelId: parsed.offer.channelId,
        browserPub: parsed.offer.browserPub,
        phonePub: keyPair.publicKey,
      })
    } catch {
      keys = null
    }
  const core = createCore<PhoneApprovalState, ApprovalStatus, ApprovalRole>(
    'phone',
    !parsed.ok
      ? { step: 'invalid', problem: parsed.problem }
      : keys
        ? { step: 'idle' }
        : { step: 'invalid', problem: 'damaged' },
    deps
  )
  const offer = parsed.ok && keys ? parsed.offer : null
  /** Sealed once, so a repeated send is the same key (`ok`). */
  let sealedKey: string | null = null
  let status: ApprovalStatus | null = null
  let failure: ApprovalFailure | null = null
  /** The server may hold this phone's claim: a claim landed, or got no answer. */
  let held = false
  let polling = false

  const options = () => ({
    baseUrl: deps.baseUrl,
    authorize: account.authorize,
    fetchImpl: deps.fetchImpl,
  })

  const terminal = () =>
    ['invalid', 'done', 'declined', 'cancelled', 'failed'].includes(
      core.state.step
    )

  const fail = (reason: ApprovalFailure) => {
    failure = reason
    core.set({ step: 'failed', reason })
  }

  const cancelOnServer = () =>
    offer && held
      ? core
          .call('approval/cancel', () =>
            cancelApprovalAsPhone(offer.channelId, options())
          )
          .then(() => {
            status = 'cancelled'
          })
          .catch(() => undefined)
      : Promise.resolve()

  async function claim(): Promise<void> {
    if (core.state.step !== 'idle' || !offer || !keys) return
    const derived = keys
    core.set({ step: 'claiming' })
    const body = {
      channelId: offer.channelId,
      claimToken: deriveApprovalClaimToken(offer.secret, offer.channelId),
      phonePub: keyPair.publicKey,
    }
    const send = () =>
      core.call('approval/claim', () => claimApproval(body, options()))
    try {
      let answer
      try {
        answer = await send()
      } catch (error) {
        // The same claim again is `ok` if only the answer got lost.
        if (approvalFailureFor(error, { claim: true }) !== 'offline')
          throw error
        held = true
        answer = await send()
      }
      held = true
      status = 'claimed'
      if (terminal()) return void (await cancelOnServer())
      let hello: ApprovalHello
      try {
        hello = openApprovalHello(
          deriveApprovalHelloKey(offer.secret, offer.channelId),
          offer.channelId,
          answer.hello
        )
      } catch {
        core.log({ op: 'open hello', outcome: 'tampered' })
        fail('tampered')
        void cancelOnServer()
        return
      }
      core.set({
        step: 'confirm',
        hello,
        ...(answer.location && { location: answer.location }),
        far: answer.far,
        code: derived.code,
        expiresAt: answer.expiresAt,
      })
    } catch (error) {
      if (!terminal()) fail(approvalFailureFor(error, { claim: true }))
      // Best effort: don't leave a claim the server may hold behind.
      void cancelOnServer()
    }
  }

  /** Yes, once the caller's owner check passed: sends the sealed key. */
  async function approve(): Promise<void> {
    const state = core.state
    if (state.step !== 'confirm' || !keys || !offer) return
    if (deps.now() >= state.expiresAt) {
      fail('expired')
      return
    }
    const { sendFailed: _, ...asked } = state
    core.set({ ...asked, step: 'sending' })
    sealedKey ??= sealApprovalKey(
      keys.keyKey,
      offer.channelId,
      {
        accountKey: account.accountKey,
        accountId: account.accountId,
        deviceName: account.deviceName,
      },
      deps.randomBytes
    )
    const key = sealedKey
    try {
      await core.call('approval/send', () =>
        sendApprovalKey({ channelId: offer.channelId, key }, options())
      )
      if (terminal()) return
      status = 'sent'
      core.set({ step: 'done', hello: asked.hello })
    } catch (error) {
      if (terminal()) return
      const reason = approvalFailureFor(error)
      if (reason !== 'offline' && reason !== 'conflict') return fail(reason)
      await settleSend(asked, reason)
    }
  }

  /**
   * After a send that failed: a lost answer may have delivered the key, so the
   * channel's status decides. Still `claimed` after a lost connection, the User
   * can tap Yes again.
   */
  async function settleSend(
    asked: Omit<Extract<PhoneApprovalState, { step: 'confirm' }>, 'sendFailed'>,
    reason: 'offline' | 'conflict'
  ): Promise<void> {
    let view: ApprovalStatus
    try {
      view = (
        await core.call(
          'approval/status',
          () => approvalStatusAsPhone(offer!.channelId, options()),
          (value) => value.status
        )
      ).status
    } catch {
      if (!terminal()) core.set({ ...asked, step: 'confirm', sendFailed: true })
      return
    }
    if (terminal()) return
    status = view
    if (view === 'sent' || view === 'done')
      core.set({ step: 'done', hello: asked.hello })
    else if (view === 'cancelled') fail('cancelled')
    else if (view === 'claimed' && reason === 'offline')
      core.set({ ...asked, step: 'confirm', sendFailed: true })
    else fail(reason)
  }

  /** While asking: notices the browser leaving or the channel expiring. */
  async function poll(): Promise<void> {
    if (polling || core.state.step !== 'confirm' || !offer) return
    if (deps.now() >= core.state.expiresAt) return fail('expired')
    polling = true
    try {
      const view = await core.call(
        'approval/status',
        () => approvalStatusAsPhone(offer.channelId, options()),
        (value) => value.status
      )
      if (core.state.step !== 'confirm') return
      status = view.status
      if (view.status === 'cancelled') fail('cancelled')
    } catch (error) {
      if (core.state.step !== 'confirm') return
      const reason = approvalFailureFor(error)
      if (reason === 'expired') fail(reason)
    } finally {
      polling = false
    }
  }

  /** No: ends the channel. */
  async function decline(): Promise<void> {
    if (terminal()) return
    const state = core.state
    core.set({
      step: 'declined',
      hello: 'hello' in state ? state.hello : null,
    })
    await cancelOnServer()
  }

  /** The screen closed. */
  async function cancel(): Promise<void> {
    if (terminal()) return
    core.set({ step: 'cancelled' })
    await cancelOnServer()
  }

  return {
    get state() {
      return core.state
    },
    subscribe: core.subscribe,
    channelId: offer?.channelId ?? null,
    claim,
    approve,
    decline,
    cancel,
    poll,
    debug: (): PhoneApprovalDebugSnapshot => ({
      role: 'phone',
      step: core.state.step,
      channelId: offer?.channelId ?? null,
      status,
      browserPub: offer?.browserPub ?? null,
      phonePub: keyPair.publicKey,
      code: keys?.code ?? null,
      failure,
      events: [...core.events],
    }),
  }
}
